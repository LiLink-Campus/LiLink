import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from './validation/input-limits';

export function clampPositiveInt(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value == null || !Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }
  return Math.min(value, max);
}

export function buildPageResult<T>(
  items: T[],
  total: number,
  pagination: { page: number; pageSize: number },
) {
  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
  };
}

export function normalizeAdminListPagination(
  query: { page?: number; pageSize?: number },
  defaultPageSize = 12,
) {
  const page = clampPositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
  const pageSize = clampPositiveInt(
    query.pageSize,
    defaultPageSize,
    ADMIN_LIST_PAGE_SIZE_MAX,
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}
