"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { AdminRefreshButton, MERCHANT_ROLE_LABELS } from "../merchant-admin-ui";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminMerchant, AdminMerchantUser } from "../types";

type StatusFilter = "" | "active" | "inactive";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "全部" },
  { value: "active", label: "启用中" },
  { value: "inactive", label: "已停用" },
];

export default function AdminMerchantsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch, clearSearch } =
    useAdminSearch();

  const { data, loading, error: loadError, refresh } =
    useAdminCollection<AdminMerchant>("/admin/merchants", {
      page,
      pageSize: 20,
      search: submittedSearch.trim(),
      status: statusFilter || undefined,
    });

  const merchants = useMemo(() => data?.items ?? [], [data]);

  const pageTotals = useMemo(() => {
    return merchants.reduce(
      (acc, merchant) => {
        acc.templates += merchant.templateCount;
        acc.redemptions += merchant.redemptionCount;
        if (merchant.isActive) acc.active += 1;
        return acc;
      },
      { templates: 0, redemptions: 0, active: 0 },
    );
  }, [merchants]);

  async function createMerchant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending("create");
    setError(null);
    try {
      await fetchApi("/admin/merchants", {
        method: "POST",
        body: JSON.stringify({
          name: trimmed,
          contactInfo: contactInfo.trim() || undefined,
        }),
      });
      setName("");
      setContactInfo("");
      setPage(1);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建失败。");
    } finally {
      setPending(null);
    }
  }

  async function toggleActive(merchant: AdminMerchant) {
    setPending(`toggle-${merchant.id}`);
    setError(null);
    try {
      await fetchApi(`/admin/merchants/${merchant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !merchant.isActive }),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
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
    return <div className="admin-empty-state">正在加载商家…</div>;
  }

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>商家与账号</h1>
          <p className="qb-header-desc">
            管理核销商家、商家登录账号与核销成功页的推广位。停用商家会同时阻止其账号登录与核销。
          </p>
        </div>
        <AdminRefreshButton onClick={() => void refresh()} />
      </div>

      <div className="qb-metrics">
        <div className="qb-metric">
          <div className="qb-metric-value">{data?.total ?? 0}</div>
          <div className="qb-metric-label">商家总数</div>
        </div>
        <div className="qb-metric">
          <div className="qb-metric-value">{pageTotals.active}</div>
          <div className="qb-metric-label">本页启用中</div>
        </div>
        <div className="qb-metric">
          <div className="qb-metric-value">{pageTotals.templates}</div>
          <div className="qb-metric-label">本页券模板</div>
        </div>
        <div className="qb-metric">
          <div className="qb-metric-value">{pageTotals.redemptions}</div>
          <div className="qb-metric-label">本页核销数</div>
        </div>
      </div>

      <section className="ic-create-panel admin-highlight-card">
        <div>
          <h2>新增商家</h2>
          <p className="qb-header-desc" style={{ marginTop: "0.35rem" }}>
            创建后可展开卡片，配置核销账号与核销成功页推广位。
          </p>
        </div>
        <form className="mp-create-form" onSubmit={createMerchant}>
          <input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="商家名称"
            aria-label="商家名称"
          />
          <input
            value={contactInfo}
            maxLength={200}
            onChange={(event) => setContactInfo(event.target.value)}
            placeholder="联系方式（可选）"
            aria-label="联系方式"
          />
          <button
            className="button-primary"
            type="submit"
            disabled={pending === "create" || !name.trim()}
          >
            {pending === "create" ? "创建中…" : "新增商家"}
          </button>
        </form>
      </section>

      {(loadError || error) && (
        <p className="form-error" style={{ margin: "1rem 0" }}>
          {loadError ?? error}
        </p>
      )}

      <section className="ic-list-panel mp-list-panel">
        <div className="mp-list-toolbar">
          <form className="ic-search-bar" onSubmit={handleSearchSubmit}>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索商家名称…"
              aria-label="搜索商家名称"
            />
            {draftSearch && (
              <button
                type="button"
                className="ic-search-clear"
                aria-label="清除搜索"
                onClick={() => {
                  clearSearch();
                  setPage(1);
                }}
              >
                ×
              </button>
            )}
            <button className="button-primary ic-search-submit" type="submit">
              搜索
            </button>
          </form>

          <div className="ic-status-tabs" role="tablist" aria-label="商家状态筛选">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.value}
                className={`ic-status-tab${statusFilter === tab.value ? " is-active" : ""}`}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ic-list-meta">
          <p className="qb-header-desc" style={{ margin: 0 }}>
            共 {data?.total ?? 0} 个商家
            {submittedSearch.trim()
              ? ` · 搜索「${submittedSearch.trim()}」`
              : ""}
          </p>
        </div>

        <div className="qb-list" style={{ marginTop: "0.85rem" }}>
          {merchants.length === 0 && (
            <div className="admin-empty-state ic-list-empty">
              {submittedSearch.trim() || statusFilter
                ? "没有匹配的商家，试试调整搜索或筛选条件。"
                : "还没有商家，在上方新增第一个。"}
            </div>
          )}
          {merchants.map((merchant) => {
            const expanded = selectedId === merchant.id;
            return (
              <div
                key={merchant.id}
                className={`qb-card${expanded ? " mp-card-expanded" : ""}`}
              >
                <div className="qb-card-header">
                  <div className="qb-card-title">
                    <strong>{merchant.name}</strong>
                    {merchant.contactInfo && (
                      <span className="qb-card-meta">{merchant.contactInfo}</span>
                    )}
                    <div className="mp-inline-stats">
                      <span className="mp-inline-stat">
                        券模板 <strong>{merchant.templateCount}</strong>
                      </span>
                      <span className="mp-inline-stat">
                        核销 <strong>{merchant.redemptionCount}</strong>
                      </span>
                    </div>
                  </div>
                  <span
                    className={`qb-badge ${merchant.isActive ? "is-active" : "is-off"}`}
                  >
                    {merchant.isActive ? "启用中" : "已停用"}
                  </span>
                  <div className="mp-card-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() =>
                        setSelectedId((current) =>
                          current === merchant.id ? null : merchant.id,
                        )
                      }
                    >
                      {expanded ? "收起详情" : "账号 / 推广位"}
                    </button>
                    <button
                      type="button"
                      className={merchant.isActive ? "button-secondary" : "button-primary"}
                      disabled={pending === `toggle-${merchant.id}`}
                      onClick={() => void toggleActive(merchant)}
                    >
                      {pending === `toggle-${merchant.id}`
                        ? "处理中…"
                        : merchant.isActive
                          ? "停用"
                          : "启用"}
                    </button>
                  </div>
                </div>

                {expanded && (
                  <MerchantDetailPanel
                    merchant={merchant}
                    onChanged={() => void refresh()}
                  />
                )}
              </div>
            );
          })}
        </div>

        {data && data.totalPages > 1 && (
          <div className="admin-pagination ic-list-pagination">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              type="button"
            >
              上一页
            </button>
            <span>
              {data.page} / {data.totalPages} · 共 {data.total} 个商家
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
      </section>
    </div>
  );
}

function MerchantDetailPanel({
  merchant,
  onChanged,
}: {
  merchant: AdminMerchant;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<AdminMerchantUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("STAFF");
  const [promotionJson, setPromotionJson] = useState(
    JSON.stringify(merchant.promotionBlocks ?? [], null, 2),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      const result = await fetchApi<{ items: AdminMerchantUser[] }>(
        `/admin/merchants/${merchant.id}/users`,
      );
      setUsers(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载账号失败。");
    }
  }, [merchant.id]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPromotionJson(JSON.stringify(merchant.promotionBlocks ?? [], null, 2));
  }, [merchant.promotionBlocks]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("user");
    setError(null);
    try {
      await fetchApi(`/admin/merchants/${merchant.id}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          role,
        }),
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "创建账号失败。");
    } finally {
      setPending(null);
    }
  }

  async function toggleUser(user: AdminMerchantUser) {
    setPending(`user-${user.id}`);
    setError(null);
    try {
      await fetchApi(`/admin/merchant-users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      await loadUsers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败。");
    } finally {
      setPending(null);
    }
  }

  async function savePromotion() {
    setPending("promotion");
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(promotionJson);
    } catch {
      setError("推广位 JSON 格式不正确。");
      setPending(null);
      return;
    }
    try {
      await fetchApi(`/admin/merchants/${merchant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ promotionBlocks: parsed }),
      });
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存推广位失败。");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="qb-subpanel">
      {error && <p className="form-error">{error}</p>}

      <h4>登录账号</h4>
      {users === null ? (
        <p className="qb-header-desc">加载账号中…</p>
      ) : users.length === 0 ? (
        <p className="qb-header-desc">暂无账号，在下方为商家创建第一个核销账号。</p>
      ) : (
        <div className="mp-subpanel-list">
          {users.map((user) => (
            <div key={user.id} className="mp-subpanel-row">
              <div className="mp-subpanel-row-main">
                <span className="mp-subpanel-row-title">{user.email}</span>
                <span className="mp-subpanel-row-meta">
                  {user.displayName ? `${user.displayName} · ` : ""}
                  {MERCHANT_ROLE_LABELS[user.role] ?? user.role}
                  {user.lastLoginAt
                    ? ` · 最近登录 ${new Date(user.lastLoginAt).toLocaleDateString("zh-CN")}`
                    : ""}
                </span>
              </div>
              <div className="mp-card-actions">
                <span
                  className={`qb-badge ${user.isActive ? "is-active" : "is-off"}`}
                >
                  {user.isActive ? "启用" : "停用"}
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={pending === `user-${user.id}`}
                  onClick={() => void toggleUser(user)}
                >
                  {user.isActive ? "停用" : "启用"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ marginTop: "0.25rem" }}>新增账号</h4>
      <form className="mp-form-grid" onSubmit={createUser}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="账号邮箱"
          aria-label="账号邮箱"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="初始密码（≥8 位）"
          aria-label="初始密码"
        />
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="显示名（可选）"
          aria-label="显示名"
        />
        <select
          value={role}
          aria-label="账号角色"
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="STAFF">店员</option>
          <option value="OWNER">店主</option>
        </select>
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "user" || !email.trim() || password.length < 8}
        >
          {pending === "user" ? "创建中…" : "新增账号"}
        </button>
      </form>

      <h4 style={{ marginTop: "1rem" }}>核销成功页推广位</h4>
      <p className="qb-header-desc" style={{ marginTop: 0 }}>
        JSON 数组。文本块{" "}
        <code className="mp-slug">{`{"type":"TEXT","text":"关注公众号"}`}</code>
        ，二维码{" "}
        <code className="mp-slug">{`{"type":"QRCODE","imageUrl":"https://…","caption":"扫码"}`}</code>
        ；图片 URL 必须 https。
      </p>
      <textarea
        className="mp-json-editor"
        value={promotionJson}
        onChange={(event) => setPromotionJson(event.target.value)}
        rows={6}
        aria-label="推广位 JSON"
      />
      <div className="mp-card-actions" style={{ marginTop: "0.5rem" }}>
        <button
          className="button-primary"
          type="button"
          disabled={pending === "promotion"}
          onClick={() => void savePromotion()}
        >
          {pending === "promotion" ? "保存中…" : "保存推广位"}
        </button>
      </div>
    </div>
  );
}
