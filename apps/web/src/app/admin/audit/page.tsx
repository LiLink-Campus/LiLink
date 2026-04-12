"use client";

import { FormEvent, useMemo, useState } from "react";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AuditLogEntry } from "../types";

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
    return <div className="admin-empty-state">正在加载审计日志...</div>;
  }

  return (
    <div className="admin-page admin-page-stack" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>审计日志</h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>把轮次执行、学校维护、问卷改动和风险处理动作留痕，便于追责和回溯。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}>
          刷新
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <form className="admin-search-bar" onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索 action、操作者邮箱或 metadata"
        />
      </form>
      <div className="admin-tabs">
        <button
          type="button"
          className={actionFilter === "" ? "admin-tab active" : "admin-tab"}
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
            className={actionFilter === action ? "admin-tab active" : "admin-tab"}
            onClick={() => {
              setActionFilter(action);
              setPage(1);
            }}
          >
            {action}
          </button>
        ))}
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
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
                <td className="admin-metadata-cell">
                  <code>{JSON.stringify(log.metadata ?? {}, null, 2)}</code>
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="admin-empty-state">没有匹配的审计日志。</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {data ? (
        <div className="admin-pagination">
          <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
            上一页
          </button>
          <span>
            {data.page} / {data.totalPages} · 共 {data.total} 条日志
          </span>
          <button
            disabled={data.page >= data.totalPages}
            onClick={() => setPage(data.page + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      ) : null}
    </div>
  );
}
