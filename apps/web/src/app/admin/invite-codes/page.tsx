"use client";

import { FormEvent, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminInviteCode } from "../types";

type StatusFilter = "" | "active" | "inactive";

type CreatedInviteCode = {
  code: string;
  ownerName: string;
};

export default function AdminInviteCodesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("");
  const [ownerName, setOwnerName] = useState("");
  const [lastCreated, setLastCreated] = useState<CreatedInviteCode | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch, clearSearch } =
    useAdminSearch();

  const {
    data,
    loading,
    error: loadError,
    refresh,
  } = useAdminCollection<AdminInviteCode>("/admin/invite-codes", {
    page,
    pageSize: 20,
    search: submittedSearch.trim(),
    status: status || undefined,
  });

  const codes = useMemo(() => data?.items ?? [], [data]);

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = ownerName.trim();
    if (!trimmed) return;

    setPending("create");
    setError(null);
    try {
      const created = await fetchApi<CreatedInviteCode>("/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({ ownerName: trimmed }),
      });
      setLastCreated({ code: created.code, ownerName: created.ownerName });
      setOwnerName("");
      setPage(1);
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "创建失败。");
    } finally {
      setPending(null);
    }
  }

  async function toggleActive(item: AdminInviteCode) {
    setPending(`toggle-${item.id}`);
    setError(null);
    try {
      await fetchApi(`/admin/invite-codes/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      await refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载邀请码…</div>;
  }

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>邀请码</h1>
          <p className="qb-header-desc">
            为拉新同学创建专属邀请码并查看其拉到的人头数（按问卷性别细分）。姓名仅后台可见，不会展示给注册用户。
          </p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={() => void refresh()}
            type="button"
            style={{ minHeight: "2.4rem", padding: "0 1rem" }}
          >
            刷新
          </button>
        </div>
      </div>

      <div className="qb-stats-row">
        <span className="qb-stat-pill active">
          邀请码总数
          <span className="qb-stat-count">{data?.total ?? 0}</span>
        </span>
      </div>

      {/* Create */}
      <form className="qb-search" onSubmit={createCode}>
        <input
          value={ownerName}
          maxLength={100}
          onChange={(event) => setOwnerName(event.target.value)}
          placeholder="输入拉新同学姓名，生成专属邀请码…"
        />
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "create" || !ownerName.trim()}
          style={{ minHeight: "2.4rem", padding: "0 1rem", flexShrink: 0 }}
        >
          {pending === "create" ? "生成中…" : "生成邀请码"}
        </button>
      </form>

      {lastCreated && (
        <p className="form-success" style={{ marginBottom: "1rem" }}>
          已为「{lastCreated.ownerName}」生成邀请码：
          <strong style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}>
            {lastCreated.code}
          </strong>
          （请复制并发给对方）
        </p>
      )}

      {/* Search + status filter */}
      <form className="qb-search" onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索姓名或邀请码…"
        />
        {draftSearch && (
          <button
            type="button"
            className="qb-search-clear"
            onClick={() => {
              clearSearch();
              setPage(1);
            }}
          >
            ×
          </button>
        )}
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as StatusFilter);
            setPage(1);
          }}
          style={{ minHeight: "2.4rem", flexShrink: 0 }}
        >
          <option value="">全部状态</option>
          <option value="active">仅启用</option>
          <option value="inactive">仅停用</option>
        </select>
      </form>

      {loadError && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {loadError}
        </p>
      )}
      {error && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* List */}
      <div className="qb-list">
        {codes.length === 0 && (
          <div className="admin-empty-state">
            {submittedSearch.trim() || status
              ? "没有找到匹配的邀请码。"
              : "还没有邀请码，在上方输入姓名生成第一个。"}
          </div>
        )}

        {codes.map((item) => (
          <div key={item.id} className="qb-card">
            <div className="qb-card-header">
              <span
                className="qb-order-num"
                style={{ fontSize: "0.7rem" }}
                title="该邀请码下的注册人数"
              >
                {item.stats.total}
              </span>

              <div className="qb-card-title">
                <strong
                  style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}
                >
                  {item.code}
                </strong>
                <span className="qb-card-meta">
                  {item.ownerName}
                  {" · "}
                  {item.isActive ? "启用中" : "已停用"}
                  {" · 总 "}
                  {item.stats.total}
                  {" · 男 "}
                  {item.stats.male}
                  {" · 女 "}
                  {item.stats.female}
                  {" · 非二元 "}
                  {item.stats.nonBinary}
                  {" · 未填问卷 "}
                  {item.stats.unknown}
                </span>
              </div>

              <div className="qb-card-actions">
                <button
                  type="button"
                  className={item.isActive ? "button-secondary" : "button-primary"}
                  disabled={pending === `toggle-${item.id}`}
                  onClick={() => void toggleActive(item)}
                  style={{ minHeight: "1.9rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
                >
                  {pending === `toggle-${item.id}`
                    ? "处理中…"
                    : item.isActive
                      ? "停用"
                      : "启用"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="admin-pagination">
          <button
            disabled={data.page <= 1}
            onClick={() => setPage(data.page - 1)}
            type="button"
          >
            上一页
          </button>
          <span>
            {data.page} / {data.totalPages} · 共 {data.total} 个邀请码
          </span>
          <button
            disabled={data.page >= data.totalPages}
            onClick={() => setPage(data.page + 1)}
            type="button"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
