export function hasAdminListQuery(query: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  questionnaire?: string;
  userType?: string;
  gender?: string;
  action?: string;
}) {
  return Boolean(
    query.page ||
    query.pageSize ||
    query.search ||
    query.status ||
    query.questionnaire ||
    query.userType ||
    query.gender ||
    query.action,
  );
}
