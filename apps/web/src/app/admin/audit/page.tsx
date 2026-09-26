"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatChinaStandardDateTime } from "@/lib/china-standard-time";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AuditLogEntry } from "../types";

const adminStyles = [commonStyles];

const ACTION_LABELS: Record<string, string> = {
  "cycle.created": "新建轮次",
  "cycle.updated": "修改轮次",
  "cycle.duplicated": "复制轮次",
  "cycle.previewed": "生成预演",
  "cycle.prepared": "生成正式匹配",
  "cycle.revealed": "揭晓轮次",
};

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<p>正在加载审计日志…</p>}>
      <AdminAuditContent />
    </Suspense>
  );
}

function AdminAuditContent() {
  const searchParams = useSearchParams();
  const cycleId = searchParams.get("cycleId") || undefined;
  const cycleName = searchParams.get("cycleName") || cycleId;
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  useEffect(() => {
    setPage(1);
    setActionFilter("");
  }, [cycleId]);
  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AuditLogEntry>("/admin/audit-logs", {
    page,
    pageSize: 20,
    search: submittedSearch.trim(),
    action: actionFilter || undefined,
    cycleId,
  });

  const availableActions = useMemo(
    () => [...new Set((data?.items ?? []).map((log) => log.action))],
    [data]
  );
  const logs = data?.items ?? [];

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  return (
    <div className={cx(adminStyles, "admin-page admin-page-stack admin-page-wide")}>
      <div className={cx(adminStyles, "admin-page-header admin-page-header-large")}>
        <div>
          <h1 className={cx(adminStyles, "admin-page-title-large")}>审计日志</h1>
          <p className={cx(adminStyles, "admin-page-description-large")}>
            查看管理操作记录，追溯轮次预演、正式执行、账号与配置变更。
          </p>
        </div>
        <button
          className={cx(adminStyles, "ui-button ui-button--secondary admin-large-refresh-control")}
          onClick={() => void refresh()}
          type="button"
        >
          刷新
        </button>
      </div>

      {loading && <p role="status">{data ? "正在更新列表…" : "正在加载列表…"}</p>}

      {error ? <p className="ui-form-message ui-form-message--error">{error}</p> : null}

      {cycleId && (
        <div className={cx(adminStyles, "admin-section-header")}>
          <p>
            当前轮次：<strong>{cycleName}</strong>
          </p>
          <Link href="/admin/audit">查看全部审计</Link>
        </div>
      )}
      <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          aria-label="搜索审计记录"
          placeholder="搜索动作、操作者邮箱或记录内容"
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
            {ACTION_LABELS[action] ?? action}
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
                <td>
                  {formatChinaStandardDateTime(log.createdAt, {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })}
                </td>
                <td>
                  <strong>{ACTION_LABELS[log.action] ?? log.action}</strong>
                </td>
                <td>{log.actor?.displayName ?? log.actor?.email ?? "系统"}</td>
                <td>{log.actor?.school?.name ?? "—"}</td>
                <td className={cx(adminStyles, "admin-metadata-cell")}>
                  <details>
                    <summary>查看记录</summary>
                    <code>{JSON.stringify(log.metadata ?? {}, null, 2)}</code>
                  </details>
                </td>
              </tr>
            ))}
            {!loading && logs.length === 0 ? (
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
