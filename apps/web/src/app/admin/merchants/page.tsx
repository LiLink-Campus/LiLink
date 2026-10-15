"use client";

import { FormEvent, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import merchantStyles from "../merchant-admin.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminMerchant } from "../types";

import { AdminDetailDialog } from "../admin-detail-dialog";
import { MerchantDetailPanel } from "./merchant-detail-panel";
import styles from "./merchants.module.css";
import growthStyles from "../growth.module.css";

const adminStyles = [commonStyles, cardStyles, merchantStyles];

export default function AdminMerchantsPage() {
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch, clearSearch } =
    useAdminSearch();

  const {
    data,
    loading,
    error: loadError,
    refresh,
  } = useAdminCollection<AdminMerchant>("/admin/merchants", {
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
      setCreating(false);
      clearSearch();
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  return (
    <div className={cx(adminStyles, "qb-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>合作商家</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>管理入驻商家与核销账号。</p>
        </div>
        <div className={growthStyles.toolbar}>
          <button
            className="ui-button ui-button--primary"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            新增商家
          </button>
          <button type="button" className={styles.textAction} onClick={() => void refresh()}>
            刷新
          </button>
        </div>
      </div>

      {loading && <p role="status">{data ? "正在更新列表…" : "正在加载列表…"}</p>}

      <AdminDetailDialog
        open={creating}
        onClose={() => {
          if (!pending) setCreating(false);
        }}
        title="新增商家"
        headerLabel="合作商家"
      >
        <section className={growthStyles.form}>
          <div>
            <h2>新增商家</h2>
            <p className={cx(adminStyles, "qb-header-desc")} style={{ marginTop: "0.35rem" }}>
              创建后为店员配置核销账号，商家即可登录核销优惠券。
            </p>
          </div>
          <form className={growthStyles.form} onSubmit={createMerchant}>
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
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending === "create" || !name.trim()}
            >
              {pending === "create" ? "创建中…" : "新增商家"}
            </button>
          </form>
          {error && (
            <p role="alert" className="ui-form-message ui-form-message--error">
              {error}
            </p>
          )}
        </section>
      </AdminDetailDialog>

      {!creating && (loadError || error) && (
        <p className="ui-form-message ui-form-message--error" style={{ margin: "1rem 0" }}>
          {loadError ?? error}
        </p>
      )}

      <section>
        <div className={styles.searchToolbar}>
          <form className={styles.search} onSubmit={handleSearchSubmit} role="search">
            <button type="submit" aria-label="搜索">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <circle cx="10.5" cy="10.5" r="7" />
                <path d="m16 16 5 5" />
              </svg>
            </button>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索商家名称"
              aria-label="搜索商家名称"
            />
            {draftSearch && (
              <button
                type="button"
                aria-label="清除搜索"
                onClick={() => {
                  clearSearch();
                  setPage(1);
                }}
              >
                ×
              </button>
            )}
          </form>
          <p className={styles.total}>共 {data?.total ?? 0} 个商家</p>
        </div>
        <div className={styles.list}>
          {!loading && merchants.length === 0 && (
            <div className={cx(adminStyles, "admin-empty-state ic-list-empty")}>
              {submittedSearch.trim()
                ? "没有匹配的商家，试试调整搜索或筛选条件。"
                : "还没有商家，在上方新增第一个。"}
            </div>
          )}
          {merchants.map((merchant) => {
            const expanded = selectedId === merchant.id;
            return (
              <article key={merchant.id} aria-label={merchant.name} className={styles.card}>
                <button
                  type="button"
                  className={styles.merchantHeader}
                  aria-label={merchant.name}
                  aria-expanded={expanded}
                  aria-controls={`merchant-accounts-${merchant.id}`}
                  onClick={() =>
                    setSelectedId((current) => (current === merchant.id ? null : merchant.id))
                  }
                >
                  <span className={styles.merchantInfo}>
                    <strong>{merchant.name}</strong>
                    {merchant.contactInfo && <span>{merchant.contactInfo}</span>}
                  </span>
                  <span className={styles.summary}>
                    {merchant.userCount === undefined
                      ? "核销账号"
                      : merchant.userCount === 0
                        ? "暂无核销账号"
                        : `${merchant.userCount} 个账号 · ${merchant.activeUserCount === merchant.userCount ? "全部启用" : merchant.activeUserCount === 0 ? "已停用" : `${merchant.activeUserCount} 个启用`}`}
                  </span>
                  <svg
                    className={styles.chevron}
                    data-expanded={expanded}
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>

                {expanded && (
                  <div id={`merchant-accounts-${merchant.id}`}>
                    <MerchantDetailPanel merchant={merchant} onChanged={() => void refresh()} />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {data && data.totalPages > 1 && (
          <AdminPagination
            className={cx(adminStyles, "admin-pagination ic-list-pagination")}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="个商家"
            onPageChange={setPage}
          />
        )}
      </section>
    </div>
  );
}
