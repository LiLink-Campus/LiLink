"use client";

import { FormEvent, useMemo, useState } from "react";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AuditLogEntry } from "../types";

const adminStyles = [commonStyles];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AuditLogEntry>(
    "/admin/audit-logs",
    {
      page,
      pageSize: 20,
      search: submittedSearch.trim(),
      action: actionFilter || undefined,
    },
  );

  const availableActions = useMemo(
    () => [...new Set((data?.items ?? []).map((log) => log.action))],
    [data],
  );
  const logs = data?.items ?? [];

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  if (loading) {
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载审计日志...</div>;
  }

  return (
    <div className={cx(adminStyles, "admin-page admin-page-stack admin-page-wide")}>
      <div className={cx(adminStyles, "admin-page-header admin-page-header-large")}>
        <div>
          <h1 className={cx(adminStyles, "admin-page-title-large")}>审计日志</h1>
          <p className={cx(adminStyles, "admin-page-description-large")}>把轮次执行、学校维护、问卷改动和风险处理动作留痕，便于追责和回溯。</p>
        </div>
        <button className={cx(adminStyles, "ui-button ui-button--secondary admin-large-refresh-control")} onClick={() => void refresh()} type="button">
          刷新
        </button>
      </div>

      {error ? <p className="ui-form-message ui-form-message--error">{error}</p> : null}

      <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索 action、操作者邮箱或 metadata"
        />
      </form>
      <div className={cx(adminStyles, "admin-tabs")}>
        <button
          type="button"
          className={actionFilter === "" ? "ui-segmented-item active" : "ui-segmented-item"}
          onClick={() => {
            setActionFilter("");
            setPage(1);
          }}
        >
          全部动作
        </button>
        {availableActions.map((action) => (
          <button
            key={action}
            type="button"
            className={actionFilter === action ? "ui-segmented-item active" : "ui-segmented-item"}
            onClick={() => {
              setActionFilter(action);
              setPage(1);
            }}
          >
            {action}
          </button>
        ))}
      </div>

      <div className={cx(adminStyles, "admin-table-wrap")}>
        <table className={cx(adminStyles, "admin-table")}>
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>操作者</th>
              <th>学校</th>
              <th>元数据</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.createdAt)}</td>
                <td>
                  <strong>{log.action}</strong>
                </td>
                <td>{log.actor?.displayName ?? log.actor?.email ?? "系统"}</td>
                <td>{log.actor?.school?.name ?? "—"}</td>
                <td className={cx(adminStyles, "admin-metadata-cell")}>
                  <code>{JSON.stringify(log.metadata ?? {}, null, 2)}</code>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className={cx(adminStyles, "admin-empty-state")}>没有匹配的审计日志。</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {data ? (
        <AdminPagination
          className={cx(adminStyles, "admin-pagination")}
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          unit="条日志"
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
