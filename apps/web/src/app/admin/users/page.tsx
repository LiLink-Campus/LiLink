"use client";

import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import { AdminIcon } from "../admin-icon";
import styles from "./users.module.css";
import { adminStyles, USER_STATUS_LABELS } from "./user-display";
import { useAdminUsers } from "./use-admin-users";
import { UserDetail } from "./user-detail";

export default function AdminUsersPage() {
  const model = useAdminUsers();
  const {
    statusFilter,
    setStatusFilter,
    questionnaireFilter,
    setQuestionnaireFilter,
    userTypeFilter,
    setUserTypeFilter,
    genderFilter,
    setGenderFilter,
    setPage,
    selectedUserId,
    setSelectedUserId,
    draftSearch,
    setDraftSearch,
    data,
    loading,
    error,
    refresh,
    users,
    handleSearchSubmit,
    pending,
    deleteAllTestUsers,
    actionError,
    actionMessage,
  } = model;
  if (loading && !data) {
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载用户中心...</div>;
  }

  return (
    <div className={cx(adminStyles, "qb-container admin-wide-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>用户中心</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>
            定位用户，查看资料、问卷与轮次参与状态，处理账号。
          </p>
        </div>
        <button
          className={cx(adminStyles, "ui-button ui-button--secondary admin-refresh-control")}
          onClick={() => void refresh()}
          type="button"
        >
          刷新
        </button>
      </div>

      {error && (
        <p
          className={cx(
            adminStyles,
            "ui-form-message ui-form-message--error admin-message-bottom-sm"
          )}
        >
          {error}
        </p>
      )}
      {actionError && !selectedUserId && (
        <p
          className={cx(
            adminStyles,
            "ui-form-message ui-form-message--error admin-message-bottom-sm"
          )}
        >
          {actionError}
        </p>
      )}
      {actionMessage && !selectedUserId && (
        <p
          className={cx(
            adminStyles,
            "ui-form-message ui-form-message--success admin-message-bottom-sm"
          )}
        >
          {actionMessage}
        </p>
      )}

      <section>
        <article className={styles.listPanel}>
          <form className={styles.filters} onSubmit={handleSearchSubmit}>
            <label className={styles.search}>
              <span>搜索用户</span>
              <div>
                <AdminIcon name="search" width="16" height="16" />
                <input
                  value={draftSearch}
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="邮箱、昵称、姓名或学校"
                />
                <button type="submit" className="ui-button ui-button--secondary">
                  搜索
                </button>
              </div>
            </label>
            <label>
              <span>问卷</span>
              <select
                value={questionnaireFilter}
                onChange={(event) => {
                  setQuestionnaireFilter(event.target.value as typeof questionnaireFilter);
                  setPage(1);
                }}
              >
                <option value="all">全部问卷</option>
                <option value="submitted">已填问卷</option>
                <option value="missing">未填问卷</option>
              </select>
            </label>
            <label>
              <span>账号类型</span>
              <select
                value={userTypeFilter}
                onChange={(event) => {
                  setUserTypeFilter(event.target.value as typeof userTypeFilter);
                  setPage(1);
                }}
              >
                <option value="all">全部用户</option>
                <option value="real">真实用户</option>
                <option value="test">测试用户</option>
              </select>
            </label>
            <label>
              <span>性别</span>
              <select
                value={genderFilter}
                onChange={(event) => {
                  setGenderFilter(event.target.value as typeof genderFilter);
                  setPage(1);
                }}
              >
                <option value="all">全部性别</option>
                <option value="男">男</option>
                <option value="女">女</option>
                <option value="非二元">非二元</option>
              </select>
            </label>
          </form>
          <div className={styles.listHeading}>
            <div className={styles.statusTabs} aria-label="账号状态">
              {(["ALL", "ACTIVE", "PENDING", "SUSPENDED"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={statusFilter === status}
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                >
                  {USER_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
            <span className={styles.total}>共 {data?.total ?? 0} 位用户</span>
          </div>
          {userTypeFilter === "test" && (
            <button
              className="ui-button ui-button--secondary"
              type="button"
              disabled={pending === "delete-test"}
              onClick={() => void deleteAllTestUsers()}
            >
              {pending === "delete-test" ? "删除中…" : "删除全部测试用户"}
            </button>
          )}
          <div className={styles.tableWrap}>
            <table className={cx(adminStyles, "admin-table")}>
              <thead>
                <tr>
                  <th>用户</th>
                  <th>学校</th>
                  <th>账号状态</th>
                  <th>问卷</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.userCell}>
                        <span className={styles.avatar} aria-hidden="true">
                          {(user.displayName ?? user.email).slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>
                            {user.displayName ?? "未设置昵称"}
                            {user.isTest && <small className={styles.testTag}>测试</small>}
                          </strong>
                          <small>{user.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>{user.school?.name ?? "未识别学校"}</td>
                    <td>
                      <span className={styles.status} data-status={user.status}>
                        {USER_STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    <td>{user.questionnaireResponse?.submittedAt ? "已提交" : "未提交"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.detailButton}
                        aria-label={`查看 ${user.displayName ?? "用户"} ${user.email}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        查看 <AdminIcon name="arrow" width="14" height="14" />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className={cx(adminStyles, "admin-empty-state")}>
                        没有找到匹配的用户。
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data && (
            <AdminPagination
              className={cx(adminStyles, "admin-pagination")}
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              unit="人"
              onPageChange={setPage}
            />
          )}
        </article>

        {/* ── User detail ─── */}
        <UserDetail model={model} />
      </section>
    </div>
  );
}
