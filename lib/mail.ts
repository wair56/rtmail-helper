import { simpleParser } from 'mailparser';
import { ImapFlow } from 'imapflow';

export type MailFolder = string;

export interface AccountRecord {
  provider: string;
  email: string;
  rt: string;
  client_id?: string | null;
}

export interface MailSummary {
  id: string;
  folder: MailFolder;
  subject: string;
  senderName: string;
  senderEmail: string;
  preview: string;
  date: string;
}

export interface MailDetail {
  html: string;
  text: string;
}

export interface MailDetailSummary extends MailSummary {
  html: string;
  text: string;
}

export interface MailPageResult {
  mails: MailDetailSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MICROSOFT_IMAP_HOST = 'outlook.office365.com';
const MICROSOFT_IMAP_PORT = 993;

// IMAP 文件夹名候选（各客户端命名不统一，需探测）
const FOLDER_CANDIDATES: Record<string, string[]> = {
  inbox: ['INBOX'],
  junk: ['Junk', 'Junk Email', 'Spam'],
  trash: ['Deleted Items', 'Trash', 'Deleted Messages', 'Deleted', 'Bin'],
  sent: ['Sent Items', 'Sent', 'Sent Messages'],
  drafts: ['Drafts'],
};

const MICROSOFT_CLIENT_ID = 'dbc8e03a-b00c-46bd-ae65-b683e7707cb0';
const GOOGLE_CLIENT_ID = '228293309116.apps.googleusercontent.com';
const MAX_MESSAGES = 5;
const TOKEN_CACHE_MS = 8 * 60 * 1000;
const LIST_CACHE_MS = 45 * 1000;
const DETAIL_CACHE_MS = 3 * 60 * 1000;

const tokenCache = new Map<string, { value: string; expiresAt: number }>();
const listCache = new Map<string, { value: FolderMailResult[]; expiresAt: number }>();
const detailCache = new Map<string, { value: MailDetail; expiresAt: number }>();

// ===== IMAP 错误分类与限流冷却 =====
// 微软对同一邮箱短时间内多次 XOAUTH2 认证会限流,返回 "User is authenticated but not connected"。
// 识别出限流后,给该账号设冷却期:冷却期内不再发起任何 IMAP 认证,直接返回友好文案。
export type ImapErrorKind = 'auth_throttle' | 'auth_invalid' | 'conn_reset' | 'command_failed' | 'other';

// 延长限流冷却期:90s → 180s,给微软的限流窗口充分恢复时间
const IMAP_THROTTLE_COOLDOWN_MS = 180 * 1000;
const IMAP_ERROR_MESSAGES: Record<ImapErrorKind, string> = {
  auth_throttle: '该账号被微软临时限流（IMAP 认证过于频繁），请等待 3-5 分钟后重试',
  auth_invalid: '该账号的 Refresh Token 已失效，请重新导入',
  conn_reset: 'IMAP 连接中断，请重试',
  command_failed: '邮件操作失败，请重试',
  other: '',
};

const throttleCooldown = new Map<string, { until: number }>();

// imapflow 抛出的错误自带非标准属性,统一走 cast 读取
type ImapErrorLike = {
  code?: string | number;
  response?: unknown; // 命令路径是对象,认证路径被 imapflow 压平成字符串
  responseText?: string;
  responseStatus?: string;
  authenticationFailed?: boolean;
  oauthError?: { error?: string };
  message?: string;
  executedCommand?: string;
};

const AUTH_THROTTLE_TEXT = 'user is authenticated but not connected';
const AUTH_INVALID_TEXT = [
  'invalid_grant',
  'authenticationfailed',
  'invalid credentials',
  'logon failed',
  'auth failed',
  'oauth2 authentication failed',
  'access denied',
];
const CONN_RESET_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
];
const CONN_RESET_TEXT = [
  'client network socket disconnected',
  'connection timed out',
  'socket hang up',
  'read econnreset',
];

export function classifyImapError(error: unknown): ImapErrorKind {
  if (!(error instanceof Error)) return 'other';
  const e = error as unknown as ImapErrorLike;
  const code = String(e.code ?? '');
  const text = [e.responseText, e.response, e.message, e.executedCommand]
    .filter((s): s is string => typeof s === 'string')
    .join(' ')
    .toLowerCase();

  // 顺序敏感:限流文案必须先于 authenticationFailed 判断(生产限流错误也带 authenticationFailed: true)
  if (code === 'ETHROTTLE') return 'auth_throttle';
  if (text.includes(AUTH_THROTTLE_TEXT)) return 'auth_throttle';
  if (e.authenticationFailed === true) return 'auth_invalid';
  if (AUTH_INVALID_TEXT.some((t) => text.includes(t))) return 'auth_invalid';
  if (CONN_RESET_CODES.includes(code) || CONN_RESET_TEXT.some((t) => text.includes(t))) return 'conn_reset';
  // 其他命令级失败(如 "Command failed"),不再归为 other 导致静默失败
  if (text.includes('command failed')) return 'command_failed';
  return 'other';
}

// 标记账号被限流:只延长、不缩短已有冷却
export function markImapThrottled(email: string): void {
  const until = Date.now() + IMAP_THROTTLE_COOLDOWN_MS;
  const existing = throttleCooldown.get(email);
  if (!existing || existing.until < until) {
    throttleCooldown.set(email, { until });
  }
}

export function isImapThrottled(email: string): boolean {
  const entry = throttleCooldown.get(email);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    throttleCooldown.delete(email);
    return false;
  }
  return true;
}

// 仅测试用:清除冷却
export function clearImapThrottle(email: string): void {
  throttleCooldown.delete(email);
}

export function imapErrorMessage(kind: ImapErrorKind, error: unknown): string {
  const friendly = IMAP_ERROR_MESSAGES[kind];
  if (friendly) return friendly;
  return error instanceof Error ? error.message : 'unknown_error';
}

// 冷却期内直接抛友好错误,不打 IMAP;Google 无此问题,直接 no-op
async function assertMicrosoftNotThrottled(user: AccountRecord): Promise<void> {
  if (user.provider === 'microsoft' && isImapThrottled(user.email)) {
    throw new Error(IMAP_ERROR_MESSAGES.auth_throttle);
  }
}

export function normalizeFolder(input: string | null | undefined): MailFolder | null {
  if (!input) return 'inbox';

  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized === 'inbox') return 'inbox';
  if (normalized === 'trash') return 'trash';
  if (normalized === 'all') return null;
  return trimmed || null;
}

export type FolderSet =
  | { mode: 'single'; folder: MailFolder }
  | { mode: 'all' };

export function normalizeFolderSet(input: string | null | undefined): FolderSet | null {
  if (!input) return { mode: 'single', folder: 'inbox' };

  const trimmed = input.trim();
  if (!trimmed) return { mode: 'single', folder: 'inbox' };
  if (trimmed.toLowerCase() === 'all') return { mode: 'all' };

  const folder = normalizeFolder(trimmed);
  return folder ? { mode: 'single', folder } : null;
}

export interface FolderMailResult {
  folder: MailFolder;
  label: string;
  mails: MailSummary[];
  error?: string;
}

export function orderFolderResults(results: FolderMailResult[]): FolderMailResult[] {
  return [...results].sort((a, b) => folderSortRank(a) - folderSortRank(b) || a.label.localeCompare(b.label));
}

export function getDefaultMailFolders(provider: string): MailFolder[] {
  return provider === 'google' ? ['inbox', 'spam', 'trash'] : ['inbox', 'junk', 'trash'];
}

export async function listMail(user: AccountRecord, folder: MailFolder): Promise<MailSummary[]> {
  const accessToken = await getAccessToken(user);
  await assertMicrosoftNotThrottled(user);

  if (user.provider === 'google') {
    return listGoogleMail(accessToken, folder);
  }

  return listMicrosoftMail(user.email, accessToken, folder);
}

export async function listMailByFolders(user: AccountRecord, folders: MailFolder[] | 'all'): Promise<FolderMailResult[]> {
  const target = folders === 'all' ? getDefaultMailFolders(user.provider) : folders;
  const cacheKey = `list:${user.email}:${user.provider}:${target.join('|')}`;
  const cached = getCache(listCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getAccessToken(user);
  await assertMicrosoftNotThrottled(user);

  if (user.provider === 'google') {
    const results = await Promise.all(
      target.map(async (folder) => {
        try {
          const mails = await listGoogleMail(accessToken, folder);
          return { folder, label: folderLabel(folder), mails };
        } catch (error) {
          return { folder, label: folderLabel(folder), mails: [], error: errorMessage(error) };
        }
      })
    );
    setCache(listCache, cacheKey, orderFolderResults(results), LIST_CACHE_MS);
    return orderFolderResults(results);
  }

  const ordered = orderFolderResults(await listMicrosoftAllFolders(user.email, accessToken, target));
  setCache(listCache, cacheKey, ordered, LIST_CACHE_MS);
  return ordered;
}

export async function listMailPage(user: AccountRecord, folder: MailFolder, page = 1): Promise<MailPageResult> {
  const accessToken = await getAccessToken(user);
  await assertMicrosoftNotThrottled(user);
  const pageSize = MAX_MESSAGES;

  if (user.provider === 'google') {
    return listGoogleMailPage(accessToken, folder, page, pageSize);
  }

  return listMicrosoftMailPage(user.email, accessToken, folder, page, pageSize);
}

async function listGoogleMailPage(
  accessToken: string,
  folder: MailFolder,
  page: number,
  pageSize: number
): Promise<MailPageResult> {
  const params = new URLSearchParams({
    maxResults: '100',
  });
  params.append('labelIds', googleLabelId(folder));
  if (folder === 'trash' || folder === 'spam') {
    params.set('includeSpamTrash', 'true');
  }

  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json();

  if (!listRes.ok) {
    throw new Error(listData.error?.message || '获取 Gmail 邮件列表失败');
  }

  const allMessages = Array.isArray(listData.messages) ? listData.messages : [];
  const total = allMessages.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const startIdx = (clampedPage - 1) * pageSize;
  const pageMessages = allMessages.slice(startIdx, startIdx + pageSize);

  const mails = await Promise.all(
    pageMessages.map(async (msg: { id?: string }) => {
      if (!msg.id) return null;
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=raw`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const detailData = await detailRes.json();
        if (!detailRes.ok || typeof detailData.raw !== 'string') return null;

        const parsed = await simpleParser(Buffer.from(detailData.raw, 'base64url'));
        const headers = Array.isArray(detailData.payload?.headers) ? detailData.payload.headers : [];
        const subject = getHeaderValue(headers, 'subject') || '(无主题)';
        const from = getHeaderValue(headers, 'from') || '';
        const dateHeader = getHeaderValue(headers, 'date');
        const sender = parseFromHeader(from);

        return {
          id: detailData.id as string,
          folder,
          subject,
          senderName: sender.name,
          senderEmail: sender.email,
          preview: typeof detailData.snippet === 'string' ? detailData.snippet : '',
          date: toIsoDate(dateHeader),
          html: sanitizeHtml(getHtmlContent(parsed.html)),
          text: parsed.text?.trim() || '',
        } satisfies MailDetailSummary;
      } catch {
        return null;
      }
    })
  );

  return {
    mails: mails.filter((m): m is MailDetailSummary => Boolean(m)),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

// ===== IMAP 连接池（按邮箱复用，避免微软同账号并发连接限制）=====
// 同一邮箱：单一连接 + 互斥队列，串行使用；空闲 IMAP_POOL_TTL_MS 后关闭
// 添加 NOOP keepalive:连接空闲 30s 后发送 NOOP 保活,避免服务器单方面断开
const imapPool = new Map<string, { client: ImapFlow; lastUsed: number; keepaliveTimer?: NodeJS.Timeout }>();
const imapQueue = new Map<string, Promise<unknown>>();
// 延长连接池 TTL:减少认证频率是关键,90s → 15min
const IMAP_POOL_TTL_MS = 15 * 60 * 1000;
const IMAP_KEEPALIVE_INTERVAL_MS = 30 * 1000;

// 串行执行：同一邮箱的请求排队，保证单连接不被并发操作
function withImapMutex<T>(email: string, fn: () => Promise<T>): Promise<T> {
  const prev = imapQueue.get(email) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // 吞掉错误避免队列断链，但把错误传给当前调用者
  const guarded = run.catch(() => {});
  imapQueue.set(email, guarded);
  // 清理队列引用（让 GC 回收）
  guarded.then(() => {
    if (imapQueue.get(email) === guarded) imapQueue.delete(email);
  });
  return run;
}

async function openMicrosoftImap(email: string, accessToken: string): Promise<ImapFlow> {
  // 冷却期内任何打开连接的尝试都直接拒绝,不再发起认证
  if (isImapThrottled(email)) {
    throw new Error(IMAP_ERROR_MESSAGES.auth_throttle);
  }

  // 惰性清理空闲超时的连接
  const now = Date.now();
  for (const [key, entry] of imapPool) {
    if (now - entry.lastUsed > IMAP_POOL_TTL_MS) {
      imapPool.delete(key);
      if (entry.keepaliveTimer) clearTimeout(entry.keepaliveTimer);
      entry.client.logout().catch(() => {});
    }
  }

  const existing = imapPool.get(email);
  if (existing) {
    existing.lastUsed = Date.now();
    // 停掉旧的 keepalive timer,touch 会重新设置
    if (existing.keepaliveTimer) clearTimeout(existing.keepaliveTimer);
    // 池中连接可能已半死(服务器限流后残留),复用前检查可用性
    if (existing.client.usable) {
      console.log(`[imap] reusing pooled connection for ${email}`);
      return existing.client;
    }
    console.log(`[imap] pooled connection unusable for ${email}, creating new one`);
    imapPool.delete(email);
    existing.client.logout().catch(() => {});
  }

  console.log(`[imap] opening new connection for ${email}`);
  const client = new ImapFlow({
    host: MICROSOFT_IMAP_HOST,
    port: MICROSOFT_IMAP_PORT,
    secure: true,
    auth: { user: email, accessToken },
    logger: false,
    connectionTimeout: 20000,
  });
  // 防止连接被重置时抛 uncaughtException 导致进程崩溃
  client.on('error', () => {});
  try {
    await client.connect();
  } catch (error) {
    // 连接阶段被限流 → 标记冷却,避免后续请求再用旧 token 反复撞限流
    if (classifyImapError(error) === 'auth_throttle') {
      markImapThrottled(email);
    }
    throw error;
  }
  imapPool.set(email, { client, lastUsed: Date.now() });
  return client;
}

// 从池中移除并关闭连接（出错时调用）
async function invalidateMicrosoftImap(email: string) {
  const entry = imapPool.get(email);
  if (entry) {
    imapPool.delete(email);
    if (entry.keepaliveTimer) clearTimeout(entry.keepaliveTimer);
    entry.client.logout().catch(() => {});
  }
}

// 统一的 IMAP 重试策略(在 mutex 内执行,不与排队操作竞争):
// - 限流:标记冷却,不重试,快速失败返回友好文案
// - 凭证失效:不重试,快速失败
// - 连接断开:丢弃坏连接,新连接重试 1 次;重试后仍断 → 友好文案
// - 其他:原样抛出
async function withImapRetry<T>(email: string, accessToken: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  try {
    return await fn(1);
  } catch (error) {
    const kind = classifyImapError(error);
    console.error('[imap] error classified as', kind, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    if (kind === 'auth_throttle') {
      markImapThrottled(email);
      throw new Error(imapErrorMessage('auth_throttle', error));
    }
    if (kind === 'auth_invalid') {
      throw new Error(imapErrorMessage('auth_invalid', error));
    }
    if (kind === 'conn_reset') {
      await invalidateMicrosoftImap(email);
      try {
        return await fn(2);
      } catch (error2) {
        const kind2 = classifyImapError(error2);
        if (kind2 === 'auth_throttle') {
          markImapThrottled(email);
          throw new Error(imapErrorMessage('auth_throttle', error2));
        }
        if (kind2 === 'auth_invalid') {
          throw new Error(imapErrorMessage('auth_invalid', error2));
        }
        await invalidateMicrosoftImap(email);
        throw new Error(imapErrorMessage(kind2 === 'command_failed' ? 'command_failed' : 'conn_reset', error2));
      }
    }
    // 命令级失败(如 "Command failed")不重试,返回友好文案而非原始英文
    if (kind === 'command_failed') {
      await invalidateMicrosoftImap(email);
      throw new Error(imapErrorMessage('command_failed', error));
    }
    throw error;
  }
}

// 标记连接已使用（不需要主动关闭，池会按 TTL 回收）
// 启动 keepalive timer:连接空闲 30s 后发 NOOP,保持连接活跃
function touchMicrosoftImap(email: string) {
  const entry = imapPool.get(email);
  if (!entry) return;

  entry.lastUsed = Date.now();

  // 清除旧 timer,重新设置:每次 touch 后 30s 发 NOOP
  if (entry.keepaliveTimer) clearTimeout(entry.keepaliveTimer);

  entry.keepaliveTimer = setTimeout(async () => {
    // 空闲 30s 后,如果连接还活着就发 NOOP 保活
    const current = imapPool.get(email);
    if (current?.client === entry.client && entry.client.usable) {
      try {
        await entry.client.noop();
      } catch {
        // NOOP 失败说明连接已死,从池中移除
        if (imapPool.get(email) === entry) {
          imapPool.delete(email);
        }
      }
    }
  }, IMAP_KEEPALIVE_INTERVAL_MS);
}

// 探测真实文件夹名（IMAP 各客户端命名不统一）
async function resolveImapFolder(client: ImapFlow, folder: MailFolder): Promise<string | null> {
  const candidates = FOLDER_CANDIDATES[folder.toLowerCase()] || [folder];
  const list = await client.list();
  const realNames = new Set(list.map((m: { path: string }) => m.path));
  return candidates.find((c) => realNames.has(c)) || candidates[0] || null;
}

async function listMicrosoftMailPage(
  email: string,
  accessToken: string,
  folder: MailFolder,
  page: number,
  pageSize: number
): Promise<MailPageResult> {
  // 同一邮箱串行执行,复用池化连接;限流/断连等错误由 withImapRetry 统一处理
  return withImapMutex(email, () =>
    withImapRetry(email, accessToken, (attempt) =>
      listMicrosoftMailPageOnce(email, accessToken, folder, page, pageSize)
    )
  );
}

async function listMicrosoftMailPageOnce(
  email: string,
  accessToken: string,
  folder: MailFolder,
  page: number,
  pageSize: number
): Promise<MailPageResult> {
  const client = await openMicrosoftImap(email, accessToken);
  try {
    const resolved = await resolveImapFolder(client, folder);
    if (!resolved) return { mails: [], total: 0, page, pageSize, totalPages: 1 };

    const lock = await client.getMailboxLock(resolved);
    try {
      const mailbox = client.mailbox;
      const total = mailbox ? mailbox.exists || 0 : 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const clampedPage = Math.min(page, totalPages);

      // 空文件夹直接返回，避免 fetch 不存在的序号范围导致 IMAP 报错
      if (total === 0) {
        touchMicrosoftImap(email);
        return { mails: [], total: 0, page: clampedPage, pageSize, totalPages };
      }

      // IMAP 序号从 1 开始，最新邮件在末尾；取当前页的序号范围
      const start = Math.max(1, total - (clampedPage * pageSize - 1));
      const end = Math.max(1, total - ((clampedPage - 1) * pageSize));

      const fetched: MailDetailSummary[] = [];
      // maxLength 限制：避免拉取超大邮件（如含大量内联图片的 500KB+ 欢迎信）导致解析极慢
      for await (const msg of client.fetch(`${start}:${end}`, { source: { maxLength: 100000 }, envelope: true })) {
        try {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true });
          const from = parsed.from?.value?.[0];
          fetched.push({
            id: msg.uid.toString(),
            folder,
            subject: parsed.subject || '(无主题)',
            senderName: from?.name || '',
            senderEmail: from?.address || '',
            preview: parsed.text?.slice(0, 150) || '',
            date: parsed.date?.toISOString() || new Date().toISOString(),
            html: sanitizeHtml(getHtmlContent(parsed.html)),
            text: parsed.text?.trim() || '',
          });
        } catch {
          // skip malformed messages
        }
      }

      touchMicrosoftImap(email);
      return {
        mails: fetched.reverse(),
        total,
        page: clampedPage,
        pageSize,
        totalPages,
      };
    } finally {
      lock.release();
    }
  } catch (error) {
    // 连接可能失效,从池中移除(重试决策由 withImapRetry 统一处理)
    await invalidateMicrosoftImap(email);
    throw error;
  }
  // 连接留池复用，不主动关闭（TTL 自动回收）
}

export async function getMailDetail(user: AccountRecord, folder: MailFolder, id: string): Promise<MailDetail> {
  const cacheKey = `detail:${user.email}:${user.provider}:${folder}:${id}`;
  const cached = getCache(detailCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getAccessToken(user);
  await assertMicrosoftNotThrottled(user);
  let detail: MailDetail;

  if (user.provider === 'google') {
    detail = await getGoogleMailDetail(accessToken, id);
  } else {
    detail = await getMicrosoftMailDetail(user.email, accessToken, folder, id);
  }

  setCache(detailCache, cacheKey, detail, DETAIL_CACHE_MS);
  return detail;
}


async function getAccessToken(user: AccountRecord): Promise<string> {
  const tokenCacheKey = `token:${user.provider}:${user.email}:${getOAuthClientId(user)}:${user.rt.slice(-12)}`;
  const cached = getCache(tokenCache, tokenCacheKey);
  if (cached) return cached;

  const cleanToken = user.rt.trim().startsWith('rt_') ? user.rt.trim().slice(3) : user.rt.trim();

  if (user.provider === 'google') {
    const tokenParams = new URLSearchParams({
      client_id: getOAuthClientId(user),
      refresh_token: cleanToken,
      grant_type: 'refresh_token',
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || '从谷歌获取访问令牌失败');
    }

    setCache(tokenCache, tokenCacheKey, tokenData.access_token as string, TOKEN_CACHE_MS);
    return tokenData.access_token as string;
  }

  const tokenParams = new URLSearchParams({
    client_id: getOAuthClientId(user),
    refresh_token: cleanToken,
    grant_type: 'refresh_token',
  });

  const tokenRes = await fetch('https://login.live.com/oauth20_token.srf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParams.toString(),
  });
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    const detail = String(tokenData.error_description || tokenData.error || '');
    // token 刷新阶段的 invalid_grant / expired：复用 auth_invalid 分类，返回友好中文
    // 真实错误形如 "The user could not be authenticated as the grant is expired."
    if (/invalid_grant|grant is expired|token expired|refresh_token/i.test(detail)) {
      throw new Error(IMAP_ERROR_MESSAGES.auth_invalid);
    }
    throw new Error(detail || '通过微软 RT 刷新令牌失败');
  }

  setCache(tokenCache, tokenCacheKey, tokenData.access_token as string, TOKEN_CACHE_MS);
  return tokenData.access_token as string;
}

export function getOAuthClientId(user: AccountRecord): string {
  const clientId = user.client_id?.trim();
  if (user.provider === 'google') {
    return clientId || GOOGLE_CLIENT_ID;
  }

  if (clientId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return clientId;
  }

  return MICROSOFT_CLIENT_ID;
}

async function listGoogleMail(accessToken: string, folder: MailFolder): Promise<MailSummary[]> {
  const params = new URLSearchParams({
    maxResults: String(MAX_MESSAGES),
  });
  params.append('labelIds', googleLabelId(folder));
  if (folder === 'trash' || folder === 'spam') {
    params.set('includeSpamTrash', 'true');
  }

  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const listData = await listRes.json();

  if (!listRes.ok) {
    throw new Error(listData.error?.message || '获取 Gmail 邮件列表失败');
  }

  const messages = Array.isArray(listData.messages) ? listData.messages : [];
  const summaries = await Promise.all(
    messages.map(async (message: { id?: string }) => {
      if (!message.id) return null;

      const metadataParams = new URLSearchParams({ format: 'metadata' });
      metadataParams.append('metadataHeaders', 'Subject');
      metadataParams.append('metadataHeaders', 'From');
      metadataParams.append('metadataHeaders', 'Date');

      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?${metadataParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const detailData = await detailRes.json();

      if (!detailRes.ok) {
        return null;
      }

      const headers = Array.isArray(detailData.payload?.headers) ? detailData.payload.headers : [];
      const subject = getHeaderValue(headers, 'subject') || '(无主题)';
      const from = getHeaderValue(headers, 'from') || '';
      const dateHeader = getHeaderValue(headers, 'date');
      const sender = parseFromHeader(from);

      return {
        id: detailData.id as string,
        folder,
        subject,
        senderName: sender.name,
        senderEmail: sender.email,
        preview: typeof detailData.snippet === 'string' ? detailData.snippet : '',
        date: toIsoDate(dateHeader),
      } satisfies MailSummary;
    })
  );

  return summaries.filter((summary): summary is MailSummary => Boolean(summary));
}

async function getGoogleMailDetail(accessToken: string, id: string): Promise<MailDetail> {
  const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const detailData = await detailRes.json();

  if (!detailRes.ok || typeof detailData.raw !== 'string') {
    throw new Error(detailData.error?.message || '获取 Gmail 邮件详情失败');
  }

  const parsed = await simpleParser(Buffer.from(detailData.raw, 'base64url'));
  return {
    html: sanitizeHtml(getHtmlContent(parsed.html)),
    text: parsed.text?.trim() || '',
  };
}

async function listMicrosoftMail(email: string, accessToken: string, folder: MailFolder): Promise<MailSummary[]> {
  // 复用 IMAP 分页实现取第 1 页，去掉正文只留摘要（folder=all 模式用）
  const result = await listMicrosoftMailPage(email, accessToken, folder, 1, MAX_MESSAGES);
  return result.mails.map(({ html, text, ...summary }) => summary);
}

// 单连接串行拉多个文件夹，避免并行开多个 IMAP 连接触发微软限流（ECONNRESET）
async function listMicrosoftAllFolders(email: string, accessToken: string, folders: MailFolder[]): Promise<FolderMailResult[]> {
  return withImapMutex(email, () =>
    withImapRetry(email, accessToken, (attempt) =>
      listMicrosoftAllFoldersOnce(email, accessToken, folders)
    )
  );
}

async function listMicrosoftAllFoldersOnce(email: string, accessToken: string, folders: MailFolder[]): Promise<FolderMailResult[]> {
  const client = await openMicrosoftImap(email, accessToken);
  const results: FolderMailResult[] = [];
  try {
    for (const folder of folders) {
      try {
        const resolved = await resolveImapFolder(client, folder);
        if (!resolved) {
          results.push({ folder, label: folderLabel(folder), mails: [] });
          continue;
        }
        const lock = await client.getMailboxLock(resolved);
        try {
          const mailbox = client.mailbox;
          const total = mailbox ? mailbox.exists || 0 : 0;
          if (total === 0) {
            results.push({ folder, label: folderLabel(folder), mails: [] });
            continue;
          }
          const start = Math.max(1, total - (MAX_MESSAGES - 1));
          const fetched: MailSummary[] = [];
          for await (const msg of client.fetch(`${start}:${total}`, { source: { maxLength: 100000 }, envelope: true })) {
            try {
              if (!msg.source) continue;
              const parsed = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true });
              const from = parsed.from?.value?.[0];
              fetched.push({
                id: msg.uid.toString(),
                folder,
                subject: parsed.subject || '(无主题)',
                senderName: from?.name || '',
                senderEmail: from?.address || '',
                preview: parsed.text?.slice(0, 150) || '',
                date: parsed.date?.toISOString() || new Date().toISOString(),
              });
            } catch {
              // skip malformed
            }
          }
          results.push({ folder, label: folderLabel(folder), mails: fetched.reverse() });
        } finally {
          lock.release();
        }
      } catch (error) {
        results.push({ folder, label: folderLabel(folder), mails: [], error: errorMessage(error) });
      }
    }
    touchMicrosoftImap(email);
  } catch (error) {
    // 连接可能失效,从池中移除(重试决策由 withImapRetry 统一处理)
    await invalidateMicrosoftImap(email);
    throw error;
  }
  return results;
}

async function listAllMicrosoftMailboxes(email: string, accessToken: string): Promise<FolderMailResult[]> {
  const folders = ['inbox', 'junk', 'trash'];
  const results: FolderMailResult[] = [];

  for (const folder of folders) {
    try {
      const mails = await listMicrosoftMail(email, accessToken, folder);
      results.push({ folder, label: folderLabel(folder), mails });
    } catch (error) {
      results.push({ folder, label: folderLabel(folder), mails: [], error: errorMessage(error) });
    }
  }

  return results;
}

async function getMicrosoftMailDetail(
  email: string,
  accessToken: string,
  folder: MailFolder,
  id: string
): Promise<MailDetail> {
  return withImapMutex(email, () =>
    withImapRetry(email, accessToken, (attempt) =>
      getMicrosoftMailDetailOnce(email, accessToken, folder, id)
    )
  );
}

async function getMicrosoftMailDetailOnce(
  email: string,
  accessToken: string,
  folder: MailFolder,
  id: string
): Promise<MailDetail> {
  const client = await openMicrosoftImap(email, accessToken);
  try {
    const resolved = await resolveImapFolder(client, folder);
    if (!resolved) return { html: '', text: '' };

    const lock = await client.getMailboxLock(resolved);
    try {
      // id 是 IMAP UID；必须传 { uid } 对象，imapflow 才会生成 "UID FETCH <id>"，
      // 传裸数字会被当成序号，微软返回 "The specified message set is invalid"。
      for await (const msg of client.fetch({ uid: id }, { source: true })) {
        if (!msg.source) continue;
        const parsed = await simpleParser(msg.source);
        touchMicrosoftImap(email);
        return {
          html: sanitizeHtml(getHtmlContent(parsed.html)),
          text: parsed.text?.trim() || '',
        };
      }
      touchMicrosoftImap(email);
      return { html: '', text: '' };
    } finally {
      lock.release();
    }
  } catch (error) {
    // 连接可能失效,从池中移除(重试决策由 withImapRetry 统一处理)
    await invalidateMicrosoftImap(email);
    throw error;
  }
}

function folderLabel(folder: MailFolder) {
  const normalized = folder.toLowerCase();
  if (normalized === 'inbox') return '收件箱';
  if (normalized === 'spam' || normalized === 'junk') return '垃圾邮件';
  if (normalized === 'trash') return '垃圾箱';
  return folder;
}

function googleLabelId(folder: MailFolder) {
  if (folder === 'trash') return 'TRASH';
  if (folder === 'spam') return 'SPAM';
  return 'INBOX';
}

function folderSortRank(result: FolderMailResult) {
  const key = `${result.folder} ${result.label}`.toLowerCase();
  if (key.includes('inbox') || key.includes('收件箱')) return 0;
  if (key.includes('junk') || key.includes('spam') || key.includes('垃圾邮件')) return 1;
  if (key.includes('deleted') || key.includes('trash') || key.includes('垃圾箱')) return 2;
  if (key.includes('sent') || key.includes('已发送')) return 3;
  if (key.includes('draft') || key.includes('草稿')) return 4;
  return 10;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'unknown_error';
}

function getCache<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCache<T>(cache: Map<string, { value: T; expiresAt: number }>, key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getHeaderValue(headers: Array<{ name?: string; value?: string }>, headerName: string) {
  return headers.find((header) => header.name?.toLowerCase() === headerName)?.value || '';
}

function parseFromHeader(from: string) {
  const matched = from.match(/^(.*?)\s*<(.+)>$/);
  if (!matched) {
    return { name: '', email: from.trim() };
  }

  return {
    name: matched[1].replace(/"/g, '').trim(),
    email: matched[2].trim(),
  };
}

function toIsoDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function getHtmlContent(html: string | false | Buffer | undefined) {
  if (!html) return '';
  if (typeof html === 'string') return html;
  return html.toString();
}

function sanitizeHtml(html: string) {
  if (!html) return '';

  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|base|meta|link)[^>]*?>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|base|meta|link)([^>]*)\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
}
