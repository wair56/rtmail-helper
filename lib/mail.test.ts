import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultMailFolders,
  getOAuthClientId,
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
