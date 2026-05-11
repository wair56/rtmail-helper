export interface AccountPagination {
  page: number;
  pageSize: number;
  offset: number;
}

export interface AccountPaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function parseAccountPagination(searchParams: URLSearchParams): AccountPagination {
  const page = toPositiveInteger(searchParams.get('page'), DEFAULT_PAGE);
  const requestedPageSize = toPositiveInteger(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

export function buildAccountPaginationMeta(total: number, page: number, pageSize: number): AccountPaginationMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function toPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}
