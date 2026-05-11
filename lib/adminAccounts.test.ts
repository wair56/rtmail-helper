import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccountPagination, buildAccountPaginationMeta } from './adminAccounts.ts';

test('parseAccountPagination defaults to first page with 50 rows', () => {
  assert.deepEqual(parseAccountPagination(new URL('https://x.test/api/admin/accounts').searchParams), {
    page: 1,
    pageSize: 50,
    offset: 0,
  });
});

test('parseAccountPagination clamps invalid and oversized values', () => {
  assert.deepEqual(parseAccountPagination(new URL('https://x.test/api/admin/accounts?page=-2&pageSize=999').searchParams), {
    page: 1,
    pageSize: 200,
    offset: 0,
  });
});

test('parseAccountPagination computes offset for valid values', () => {
  assert.deepEqual(parseAccountPagination(new URL('https://x.test/api/admin/accounts?page=3&pageSize=25').searchParams), {
    page: 3,
    pageSize: 25,
    offset: 50,
  });
});

test('buildAccountPaginationMeta reports total pages', () => {
  assert.deepEqual(buildAccountPaginationMeta(17224, 2, 50), {
    total: 17224,
    page: 2,
    pageSize: 50,
    totalPages: 345,
  });
});
