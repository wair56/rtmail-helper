import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

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

const IMAP_SERVERS: Record<string, { host: string; port: number }> = {
  'hotmail.com': { host: 'outlook.office365.com', port: 993 },
  'outlook.com': { host: 'outlook.office365.com', port: 993 },
  'live.com': { host: 'outlook.office365.com', port: 993 },
  'msn.com': { host: 'outlook.office365.com', port: 993 },
  'gmail.com': { host: 'imap.gmail.com', port: 993 },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993 },
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

const MAILBOX_NAME_CANDIDATES: Record<string, string[]> = {
  inbox: ['INBOX'],
  trash: ['Deleted Items', 'Trash', 'Deleted Messages', 'Deleted', 'Bin'],
};

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

type MailboxLike = {
  path: string;
  specialUse?: string | null;
  flags?: Set<string> | string[] | null;
};

export function describeAvailableMailboxes(mailboxes: MailboxLike[]): string {
  if (mailboxes.length === 0) return '无可用文件夹';

  return mailboxes
    .map((mailbox) => {
      const specialUse = mailbox.specialUse ? ` (${mailbox.specialUse})` : '';
      return `${mailbox.path}${specialUse}`;
    })
    .join(', ');
}

export function isSelectableMailbox(mailbox: MailboxLike): boolean {
  const flags = mailbox.flags;
  if (!flags) return true;
  if (flags instanceof Set) return !flags.has('\\Noselect');
  return !flags.includes('\\Noselect');
}

export function orderFolderResults(results: FolderMailResult[]): FolderMailResult[] {
  return [...results].sort((a, b) => folderSortRank(a) - folderSortRank(b) || a.label.localeCompare(b.label));
}

export function getDefaultMailFolders(provider: string): MailFolder[] {
  return provider === 'google' ? ['inbox', 'spam', 'trash'] : ['inbox', 'junk', 'trash'];
}

export async function listMail(user: AccountRecord, folder: MailFolder): Promise<MailSummary[]> {
  const accessToken = await getAccessToken(user);

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

  const results = await Promise.all(
    target.map(async (folder) => {
      try {
        const mails = await listMicrosoftMail(user.email, accessToken, folder);
        return { folder, label: folderLabel(folder), mails };
      } catch (error) {
        return { folder, label: folderLabel(folder), mails: [], error: errorMessage(error) };
      }
    })
  );
  const ordered = orderFolderResults(results);
  setCache(listCache, cacheKey, ordered, LIST_CACHE_MS);
  return ordered;
}

export async function getMailDetail(user: AccountRecord, folder: MailFolder, id: string): Promise<MailDetail> {
  const cacheKey = `detail:${user.email}:${user.provider}:${folder}:${id}`;
  const cached = getCache(detailCache, cacheKey);
  if (cached) return cached;

  const accessToken = await getAccessToken(user);
  let detail: MailDetail;

  if (user.provider === 'google') {
    detail = await getGoogleMailDetail(accessToken, id);
  } else {
    detail = await getMicrosoftMailDetail(user.email, accessToken, folder, id);
  }

  setCache(detailCache, cacheKey, detail, DETAIL_CACHE_MS);
  return detail;
}

function getImapServer(email: string) {
  const domain = email.split('@')[1]?.toLowerCase();
  return IMAP_SERVERS[domain ?? ''] || { host: 'outlook.office365.com', port: 993 };
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
    throw new Error(tokenData.error_description || tokenData.error || '通过微软 RT 刷新令牌失败');
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
  const client = createImapClient(email, accessToken);

  try {
    await client.connect();
    const mailboxPath = await resolveMailboxPath(client, folder);
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      const totalMessages = client.mailbox ? client.mailbox.exists || 0 : 0;
      if (totalMessages === 0) {
        return [];
      }

      const startSeq = Math.max(1, totalMessages - (MAX_MESSAGES - 1));
      const summaries: MailSummary[] = [];

      for await (const message of client.fetch(`${startSeq}:*`, { envelope: true, uid: true })) {
        const envelope = message.envelope;
        const sender = envelope?.from?.[0];

        summaries.push({
          id: String(message.uid),
          folder,
          subject: envelope?.subject || '(无主题)',
          senderName: sender?.name || '',
          senderEmail: sender?.address || '',
          preview: envelope?.subject || '',
          date: envelope?.date?.toISOString() || new Date().toISOString(),
        });
      }

      return summaries.reverse();
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

async function listAllMicrosoftMailboxes(email: string, accessToken: string): Promise<FolderMailResult[]> {
  const client = createImapClient(email, accessToken);

  try {
    await client.connect();
    const mailboxes = (await client.list()).filter(isSelectableMailbox);
    const results: FolderMailResult[] = [];

    for (const mailbox of mailboxes) {
      try {
        const mails = await listMicrosoftMailboxWithClient(client, mailbox.path, mailbox.path);
        results.push({ folder: mailbox.path, label: mailboxLabel(mailbox.path, mailbox.specialUse), mails });
      } catch (error) {
        results.push({
          folder: mailbox.path,
          label: mailboxLabel(mailbox.path, mailbox.specialUse),
          mails: [],
          error: errorMessage(error),
        });
      }
    }

    return results;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

async function listMicrosoftMailboxWithClient(
  client: ImapFlow,
  mailboxPath: string,
  folder: MailFolder
): Promise<MailSummary[]> {
  const lock = await client.getMailboxLock(mailboxPath);

  try {
    const totalMessages = client.mailbox ? client.mailbox.exists || 0 : 0;
    if (totalMessages === 0) {
      return [];
    }

    const startSeq = Math.max(1, totalMessages - (MAX_MESSAGES - 1));
    const summaries: MailSummary[] = [];

    for await (const message of client.fetch(`${startSeq}:*`, { envelope: true, uid: true })) {
      const envelope = message.envelope;
      const sender = envelope?.from?.[0];

      summaries.push({
        id: String(message.uid),
        folder,
        subject: envelope?.subject || '(无主题)',
        senderName: sender?.name || '',
        senderEmail: sender?.address || '',
        preview: envelope?.subject || '',
        date: envelope?.date?.toISOString() || new Date().toISOString(),
      });
    }

    return summaries.reverse();
  } finally {
    lock.release();
  }
}

async function getMicrosoftMailDetail(
  email: string,
  accessToken: string,
  folder: MailFolder,
  id: string
): Promise<MailDetail> {
  const client = createImapClient(email, accessToken);

  try {
    await client.connect();
    const mailboxPath = await resolveMailboxPath(client, folder);
    const lock = await client.getMailboxLock(mailboxPath);

    try {
      const message = await client.fetchOne(id, { source: true }, { uid: true });
      if (!message || !message.source) {
        throw new Error('没有找到对应邮件正文');
      }

      const parsed = await simpleParser(message.source);
      return {
        html: sanitizeHtml(getHtmlContent(parsed.html)),
        text: parsed.text?.trim() || '',
      };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout errors
    }
  }
}

function createImapClient(email: string, accessToken: string) {
  const server = getImapServer(email);

  return new ImapFlow({
    host: server.host,
    port: server.port,
    secure: true,
    auth: {
      user: email,
      accessToken,
    },
    logger: false,
  });
}

async function resolveMailboxPath(client: ImapFlow, folder: MailFolder): Promise<string> {
  const mailboxes = await client.list();
  const normalizedFolder = folder.trim().toLowerCase();

  const exactPathMatch = mailboxes.find((mailbox) => mailbox.path === folder);
  if (exactPathMatch) {
    return exactPathMatch.path;
  }

  const specialUseMatch = mailboxes.find((mailbox) => {
    const specialUse = String((mailbox as { specialUse?: string | null }).specialUse || '').toLowerCase();
    if (normalizedFolder === 'inbox') {
      return specialUse === '\\inbox' || mailbox.path.toUpperCase() === 'INBOX';
    }

    return normalizedFolder === 'trash' && specialUse === '\\trash';
  });

  if (specialUseMatch) {
    return specialUseMatch.path;
  }

  const directNameMatch = mailboxes.find((mailbox) =>
    (MAILBOX_NAME_CANDIDATES[normalizedFolder] || [folder]).some(
      (candidate) => mailbox.path.localeCompare(candidate, undefined, { sensitivity: 'accent' }) === 0
    )
  );

  if (directNameMatch) {
    return directNameMatch.path;
  }

  const fuzzyMatch = mailboxes.find((mailbox) => {
    const path = mailbox.path.toLowerCase();
    if (normalizedFolder === 'inbox') {
      return path === 'inbox';
    }

    return normalizedFolder === 'trash' && (path.includes('trash') || path.includes('deleted'));
  });

  if (fuzzyMatch) {
    return fuzzyMatch.path;
  }

  throw new Error(
    `${folder === 'trash' ? '没有找到垃圾箱文件夹' : `没有找到文件夹：${folder}`}。可用文件夹：${describeAvailableMailboxes(mailboxes)}`
  );
}

function folderLabel(folder: MailFolder) {
  const normalized = folder.toLowerCase();
  if (normalized === 'inbox') return '收件箱';
  if (normalized === 'spam' || normalized === 'junk') return '垃圾邮件';
  if (normalized === 'trash') return '垃圾箱';
  return folder;
}

function mailboxLabel(path: string, specialUse?: string | null) {
  const normalized = String(specialUse || '').toLowerCase();
  if (normalized === '\\inbox') return '收件箱';
  if (normalized === '\\trash') return '垃圾箱';
  if (normalized === '\\junk') return '垃圾邮件';
  if (normalized === '\\sent') return '已发送';
  if (normalized === '\\drafts') return '草稿';
  return path;
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
