import test from 'node:test';
import assert from 'node:assert/strict';
import { nextImportModalState } from './adminImportModal.ts';

test('nextImportModalState opens modal and clears stale message', () => {
  assert.deepEqual(nextImportModalState({ open: false, message: 'old' }, 'open'), { open: true, message: null });
});

test('nextImportModalState closes modal and clears draft', () => {
  assert.deepEqual(nextImportModalState({ open: true, message: 'ok', draft: 'abc' }, 'close'), { open: false, message: null, draft: '' });
});
