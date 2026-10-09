import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyImapError,
  clearImapThrottle,
  getDefaultMailFolders,
  getOAuthClientId,
  imapErrorMessage,
  isImapThrottled,
  listMailPage,
  markImapThrottled,
  orderFolderResults,
  normalizeFolder,
  normalizeFolderSet,
} from './mail.ts';

test('normalizeFolder keeps current single-folder behavior', () => {
  assert.equal(normalizeFolder(null), 'inbox');
  assert.equal(normalizeFolder('inbox'), 'inbox');
  assert.equal(normalizeFolder('trash'), 'trash');
  assert.equal(normalizeFolder('junk'), 'junk');
  assert.equal(normalizeFolder('Deleted'), 'Deleted');
});

test('normalizeFolderSet maps all to multi-folder fetch marker', () => {
  assert.deepEqual(normalizeFolderSet(null), { mode: 'single', folder: 'inbox' });
  assert.deepEqual(normalizeFolderSet('trash'), { mode: 'single', folder: 'trash' });
  assert.deepEqual(normalizeFolderSet('all'), { mode: 'all' });
});

test('getOAuthClientId ignores malformed Microsoft client ids', () => {
  assert.equal(
    getOAuthClientId({ provider: 'microsoft', email: 'u@outlook.com', client_id: 'yetdy3338', rt: 'rt_x' }),
    'dbc8e03a-b00c-46bd-ae65-b683e7707cb0'
  );
  assert.equal(
    getOAuthClientId({
      provider: 'microsoft',
      email: 'u@outlook.com',
      client_id: '11111111-2222-3333-4444-555555555555',
      rt: 'rt_x',
    }),
    '11111111-2222-3333-4444-555555555555'
  );
});

test('orderFolderResults puts inbox, junk, and trash first', () => {
  const ordered = orderFolderResults([
    { folder: 'Notes', label: 'Notes', mails: [] },
    { folder: 'Deleted', label: '垃圾箱', mails: [] },
    { folder: 'INBOX', label: '收件箱', mails: [] },
    { folder: 'Junk', label: '垃圾邮件', mails: [] },
    { folder: 'Sent', label: '已发送', mails: [] },
  ]);

  assert.deepEqual(ordered.map((item) => item.folder), ['INBOX', 'Junk', 'Deleted', 'Sent', 'Notes']);
});

test('getDefaultMailFolders keeps the fast mailbox set small', () => {
  assert.deepEqual(getDefaultMailFolders('microsoft'), ['inbox', 'junk', 'trash']);
  assert.deepEqual(getDefaultMailFolders('google'), ['inbox', 'spam', 'trash']);
});

// ===== IMAP 错误分类 =====

test('classifyImapError recognizes production throttle signature', () => {
  // 生产环境实测的限流错误形状:Command failed + responseText + authenticationFailed
  const err = new Error('Command failed') as Error & Record<string, unknown>;
  (err as any).response = '3 NO User is authenticated but not connected.';
  (err as any).responseStatus = 'NO';
  (err as any).responseText = 'User is authenticated but not connected.';
  (err as any).authenticationFailed = true;
  assert.equal(classifyImapError(err), 'auth_throttle');
});

test('classifyImapError maps authenticationFailed without throttle phrase to auth_invalid', () => {
  const err = new Error('Command failed') as Error & Record<string, unknown>;
  (err as any).response = 'NO AUTHENTICATE failed.';
  (err as any).responseStatus = 'NO';
  (err as any).authenticationFailed = true;
  assert.equal(classifyImapError(err), 'auth_invalid');
});

test('classifyImapError maps invalid_grant to auth_invalid', () => {
  const err = new Error('Command failed') as Error & Record<string, unknown>;
  (err as any).responseText = 'invalid_grant: token expired';
  assert.equal(classifyImapError(err), 'auth_invalid');
});

test('classifyImapError maps ETHROTTLE code to auth_throttle even without phrase', () => {
  const err = new Error('Request is throttled') as Error & Record<string, unknown>;
  (err as any).code = 'ETHROTTLE';
  (err as any).responseText = 'Request is throttled. Suggested Backoff Time: 30000';
  assert.equal(classifyImapError(err), 'auth_throttle');
});

test('classifyImapError maps ECONNRESET to conn_reset and unrelated to other', () => {
  const reset = new Error('read ECONNRESET') as Error & Record<string, unknown>;
  (reset as any).code = 'ECONNRESET';
  assert.equal(classifyImapError(reset), 'conn_reset');

  const unrelated = new Error('some random failure');
  assert.equal(classifyImapError(unrelated), 'other');
  assert.equal(classifyImapError('not an error'), 'other');
  assert.equal(classifyImapError(null), 'other');
});

test('classifyImapError maps bare Command failed to command_failed', () => {
  // imapflow 命令路径的 NO/BAD 响应:response 是对象,responseText 是服务端文案
  const err = new Error('Command failed') as Error & Record<string, unknown>;
  (err as any).response = { command: 'NO', attributes: [] };
  (err as any).responseStatus = 'NO';
  (err as any).responseText = 'Some of the requested messages no longer exist.';
  assert.equal(classifyImapError(err), 'command_failed');
});

test('classifyImapError detects throttle phrase inside response object only', () => {
  // NAMESPACE 认证路径:response 被压平成字符串且含限流文案,同时带 authenticationFailed
  const err = new Error('Command failed') as Error & Record<string, unknown>;
  (err as any).response = '1 BAD User is authenticated but not connected.';
  (err as any).responseStatus = 'BAD';
  (err as any).authenticationFailed = true;
  assert.equal(classifyImapError(err), 'auth_throttle');
});

test('imapErrorMessage returns friendly Chinese messages or falls back', () => {
  const err = new Error('Command failed');
  assert.equal(imapErrorMessage('auth_throttle', err), '该账号被微软临时限流（IMAP 认证过于频繁），请等待 3-5 分钟后重试');
  assert.equal(imapErrorMessage('auth_invalid', err), '该账号的 Refresh Token 已失效，请重新导入');
  assert.equal(imapErrorMessage('conn_reset', err), 'IMAP 连接中断，请重试');
  assert.equal(imapErrorMessage('command_failed', err), '邮件操作失败，请重试');
  assert.equal(imapErrorMessage('other', err), 'Command failed');
  assert.equal(imapErrorMessage('other', 'not an error'), 'unknown_error');
});

test('throttle cooldown marks, checks, and clears per account', () => {
  const email = 'throttle-test@outlook.com';
  clearImapThrottle(email);
  assert.equal(isImapThrottled(email), false);

  markImapThrottled(email);
  assert.equal(isImapThrottled(email), true);

  // 再次标记不会缩短已有冷却(until 只延后)
  const before = Date.now() + 90 * 1000;
  markImapThrottled(email);
  assert.equal(isImapThrottled(email), true);

  clearImapThrottle(email);
  assert.equal(isImapThrottled(email), false);
});

test('token refresh invalid_grant surfaces as auth_invalid friendly message', async () => {
  // 真实线上错误:login.live.com 返回 HTTP 400 + error=invalid_grant,
  // error_description="The user could not be authenticated as the grant is expired. The user must sign in again."
  // 该错误只有 message,没有 responseText/authenticationFailed,不能靠 classifyImapError
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls++;
    return new Response(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'The user could not be authenticated as the grant is expired. The user must sign in again.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      listMailPage(
        { provider: 'microsoft', email: 'u@outlook.com', rt: 'rt_expired_grant', client_id: null },
        'inbox',
        1
      ),
      (err: Error) => {
        assert.equal(err.message, '该账号的 Refresh Token 已失效，请重新导入');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 1, 'token refresh attempted exactly once');
});
