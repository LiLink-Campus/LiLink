"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useAdminCollection } from "../use-admin-collection";
import type { AuditLogEntry } from "../types";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminAuditPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const deferredSearch = useDeferredValue(search);
  const { data, loading, error, refresh } = useAdminCollection<AuditLogEntry>(
    "/admin/audit-logs",
    {
      page,
      pageSize: 20,
      search: deferredSearch.trim(),
      action: actionFilter || undefined,
    },
  );

  const availableActions = useMemo(
    () => [...new Set((data?.items ?? []).map((log) => log.action))],
    [data],
  );
  const logs = data?.items ?? [];

  if (loading) {
    return <div className="admin-empty-state">正在加载审计日志...</div>;
  }

  return (
    <div className="admin-page admin-page-stack">
      <div className="admin-page-header">
        <div>
          <h1>审计日志</h1>
          <p>把轮次执行、学校维护、问卷改动和风险处理动作留痕，便于追责和回溯。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button">
          刷新
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="admin-search-bar">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="搜索 action、操作者邮箱或 metadata"
        />
      </div>
      <div className="admin-filter-row">
        <button
          type="button"
          className={actionFilter === "" ? "button-primary" : "button-secondary"}
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
            className={actionFilter === action ? "button-primary" : "button-secondary"}
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
              <th>Metadata</th>
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
