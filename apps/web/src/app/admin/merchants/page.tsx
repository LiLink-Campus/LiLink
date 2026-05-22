"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminMerchant, AdminMerchantUser } from "../types";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "店主",
  STAFF: "店员",
};

export default function AdminMerchantsPage() {
  const [page, setPage] = useState(1);
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
    });

  const merchants = useMemo(() => data?.items ?? [], [data]);

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
        <button
          className="button-secondary"
          onClick={() => void refresh()}
          type="button"
          style={{ minHeight: "2.4rem", padding: "0 1rem" }}
        >
          刷新
        </button>
      </div>

      <form className="qb-search" onSubmit={createMerchant}>
        <input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          placeholder="商家名称…"
        />
        <input
          value={contactInfo}
          maxLength={200}
          onChange={(event) => setContactInfo(event.target.value)}
          placeholder="联系方式（可选）"
        />
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "create" || !name.trim()}
          style={{ minHeight: "2.4rem", padding: "0 1rem", flexShrink: 0 }}
        >
          {pending === "create" ? "创建中…" : "新增商家"}
        </button>
      </form>

      <form className="qb-search" onSubmit={handleSearchSubmit}>
        <input
          value={draftSearch}
          onChange={(event) => setDraftSearch(event.target.value)}
          placeholder="搜索商家名称…"
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
      </form>

      {(loadError || error) && (
        <p className="form-error" style={{ marginBottom: "1rem" }}>
          {loadError ?? error}
        </p>
      )}

      <div className="qb-list">
        {merchants.length === 0 && (
          <div className="admin-empty-state">还没有商家，在上方新增第一个。</div>
        )}
        {merchants.map((merchant) => (
          <div key={merchant.id} className="qb-card">
            <div className="qb-card-header">
              <div className="qb-card-title">
                <strong>{merchant.name}</strong>
                <span className="qb-card-meta">
                  {merchant.contactInfo ? `${merchant.contactInfo} · ` : ""}
                  {`券模板 ${merchant.templateCount} · 核销 ${merchant.redemptionCount}`}
                </span>
              </div>
              <span
                className={`qb-badge ${merchant.isActive ? "is-active" : "is-off"}`}
              >
                {merchant.isActive ? "启用中" : "已停用"}
              </span>
              <div className="qb-card-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() =>
                    setSelectedId((current) =>
                      current === merchant.id ? null : merchant.id,
                    )
                  }
                  style={{ minHeight: "1.9rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
                >
                  {selectedId === merchant.id ? "收起" : "账号 / 推广位"}
                </button>
                <button
                  type="button"
                  className={merchant.isActive ? "button-secondary" : "button-primary"}
                  disabled={pending === `toggle-${merchant.id}`}
                  onClick={() => void toggleActive(merchant)}
                  style={{ minHeight: "1.9rem", padding: "0 0.75rem", fontSize: "0.82rem" }}
                >
                  {pending === `toggle-${merchant.id}`
                    ? "处理中…"
                    : merchant.isActive
                      ? "停用"
                      : "启用"}
                </button>
              </div>
            </div>
            {selectedId === merchant.id && (
              <MerchantDetailPanel merchant={merchant} onChanged={() => void refresh()} />
            )}
          </div>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
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
        <p>加载账号中…</p>
      ) : users.length === 0 ? (
        <p>暂无账号。</p>
      ) : (
        users.map((user) => (
          <div key={user.id} className="me-card-field">
            <span className="me-card-label">
              {user.email} · {ROLE_LABELS[user.role] ?? user.role} ·{" "}
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
        ))
      )}

      <form className="qb-search" onSubmit={createUser} style={{ marginTop: "0.5rem" }}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="账号邮箱"
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="初始密码（≥8 位）"
        />
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="显示名（可选）"
        />
        <select value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="STAFF">店员</option>
          <option value="OWNER">店主</option>
        </select>
        <button
          className="button-primary"
          type="submit"
          disabled={pending === "user" || !email.trim() || password.length < 8}
        >
          新增账号
        </button>
      </form>

      <h4 style={{ marginTop: "1rem" }}>核销成功页推广位（JSON）</h4>
      <p className="qb-header-desc" style={{ marginTop: 0 }}>
        每项形如 {`{"type":"TEXT","text":"关注公众号"}`} 或{" "}
        {`{"type":"QRCODE","imageUrl":"https://…","caption":"扫码"}`}；图片必须 https。
      </p>
      <textarea
        value={promotionJson}
        onChange={(event) => setPromotionJson(event.target.value)}
        rows={6}
        style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
      />
      <button
        className="button-secondary"
        type="button"
        disabled={pending === "promotion"}
        onClick={() => void savePromotion()}
        style={{ marginTop: "0.5rem" }}
      >
        {pending === "promotion" ? "保存中…" : "保存推广位"}
      </button>
    </div>
  );
}
