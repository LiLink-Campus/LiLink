"use client";

import { FormEvent, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminInviteCode } from "../types";

type StatusFilter = "" | "active" | "inactive";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "全部" },
  { value: "active", label: "启用中" },
  { value: "inactive", label: "已停用" },
];

type CreatedInviteCode = {
  code: string;
  ownerName: string;
};

type GenderStats = AdminInviteCode["stats"];

function GenderBar({ stats }: { stats: GenderStats }) {
  const { male, female, nonBinary, unknown } = stats;
  const total = male + female + nonBinary + unknown;
  if (total === 0) {
    return <span className="qb-genderbar ic-genderbar-empty" title="暂无注册" />;
  }
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div
      className="qb-genderbar"
      title={`男 ${male} · 女 ${female} · 非二元 ${nonBinary} · 未填 ${unknown}`}
    >
      <span className="qb-genderbar-seg is-male" style={{ width: pct(male) }} />
      <span className="qb-genderbar-seg is-female" style={{ width: pct(female) }} />
      <span
        className="qb-genderbar-seg is-nonbinary"
        style={{ width: pct(nonBinary) }}
      />
      <span
        className="qb-genderbar-seg is-unknown"
        style={{ width: pct(unknown) }}
      />
    </div>
  );
}

function GenderLegend() {
  return (
    <div className="qb-legend ic-gender-legend">
      <span className="qb-legend-item">
        <span className="qb-legend-dot" style={{ background: "var(--primary)" }} />
        男
      </span>
      <span className="qb-legend-item">
        <span className="qb-legend-dot" style={{ background: "var(--accent)" }} />
        女
      </span>
      <span className="qb-legend-item">
        <span className="qb-legend-dot" style={{ background: "var(--gold)" }} />
        非二元
      </span>
      <span className="qb-legend-item">
        <span
          className="qb-legend-dot"
          style={{ background: "var(--neutral)" }}
        />
        未填问卷
      </span>
    </div>
  );
}

function GenderCounts({ stats }: { stats: GenderStats }) {
  if (stats.total === 0) {
    return <span className="ic-gender-counts is-empty">—</span>;
  }
  return (
    <span className="ic-gender-counts">
      <span>男 {stats.male}</span>
      <span>女 {stats.female}</span>
      <span>非二元 {stats.nonBinary}</span>
      <span>未填 {stats.unknown}</span>
    </span>
  );
}

function InviteCodeRow({
  item,
  pending,
  onToggle,
}: {
  item: AdminInviteCode;
  pending: string | null;
  onToggle: (item: AdminInviteCode) => void;
}) {
  return (
    <li className="ic-row">
      <div className="ic-row-code">
        <code className="ic-code ic-code-inline">{item.code}</code>
        <CopyCodeButton code={item.code} />
      </div>
      <div className="ic-row-owner">{item.ownerName}</div>
      <div className="ic-row-status">
        <span className={`qb-badge ${item.isActive ? "is-active" : "is-off"}`}>
          {item.isActive ? "启用中" : "已停用"}
        </span>
      </div>
      <div className="ic-row-total">
        <strong>{item.stats.total}</strong>
      </div>
      <div className="ic-row-gender">
        <GenderBar stats={item.stats} />
        <GenderCounts stats={item.stats} />
      </div>
      <div className="ic-row-actions">
        <button
          type="button"
          className={item.isActive ? "button-secondary" : "button-primary"}
          disabled={pending === `toggle-${item.id}`}
          onClick={() => onToggle(item)}
        >
          {pending === `toggle-${item.id}`
            ? "处理中…"
            : item.isActive
              ? "停用"
              : "启用"}
        </button>
      </div>
    </li>
  );
}

function CopyCodeButton({
  code,
  label = "复制",
}: {
  code: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={`button-secondary ic-copy-btn${copied ? " is-copied" : ""}`}
      onClick={() => void copy()}
    >
      {copied ? "已复制" : label}
    </button>
  );
}

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

  const pageTotals = useMemo(() => {
    return codes.reduce(
      (acc, item) => {
        acc.registrations += item.stats.total;
        if (item.isActive) acc.active += 1;
        return acc;
      },
      { registrations: 0, active: 0 },
    );
  }, [codes]);

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
            为拉新同学生成专属 8 位运营码，按注册人数与问卷性别统计效果。姓名仅后台可见。
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

      <div className="qb-metrics">
        <div className="qb-metric">
          <div className="qb-metric-value">{data?.total ?? 0}</div>
          <div className="qb-metric-label">邀请码总数</div>
        </div>
        <div className="qb-metric">
          <div className="qb-metric-value">{pageTotals.active}</div>
          <div className="qb-metric-label">本页启用中</div>
        </div>
        <div className="qb-metric">
          <div className="qb-metric-value">{pageTotals.registrations}</div>
          <div className="qb-metric-label">本页注册人次</div>
        </div>
      </div>

      {lastCreated && (
        <div className="ic-created-banner" role="status">
          <div className="ic-created-copy">
            <p className="ic-created-eyebrow">刚生成的邀请码</p>
            <p className="ic-created-owner">拉新同学：{lastCreated.ownerName}</p>
            <code className="ic-code">{lastCreated.code}</code>
            <p className="ic-created-hint">请复制后发给对方，用于注册页填写。</p>
          </div>
          <CopyCodeButton code={lastCreated.code} label="复制邀请码" />
        </div>
      )}

      <section className="ic-create-panel admin-highlight-card">
        <div>
          <h2>生成新码</h2>
          <p className="qb-header-desc" style={{ marginTop: "0.35rem" }}>
            输入拉新同学姓名，系统将分配唯一 8 位码。
          </p>
        </div>
        <form className="ic-create-form" onSubmit={createCode}>
          <input
            value={ownerName}
            maxLength={100}
            onChange={(event) => setOwnerName(event.target.value)}
            placeholder="拉新同学姓名"
            aria-label="拉新同学姓名"
          />
          <button
            className="button-primary"
            type="submit"
            disabled={pending === "create" || !ownerName.trim()}
          >
            {pending === "create" ? "生成中…" : "生成邀请码"}
          </button>
        </form>
      </section>

      <section className="ic-list-panel" aria-label="邀请码列表">
        <div className="ic-list-toolbar">
          <form className="ic-search-bar" onSubmit={handleSearchSubmit}>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索姓名或邀请码…"
              aria-label="搜索邀请码"
            />
            {draftSearch ? (
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
            ) : null}
            <button className="button-primary ic-search-submit" type="submit">
              搜索
            </button>
          </form>

          <div className="ic-status-tabs" role="tablist" aria-label="状态筛选">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={status === tab.value}
                className={status === tab.value ? "ic-status-tab is-active" : "ic-status-tab"}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ic-list-meta">
          <GenderLegend />
        </div>

        {(loadError || error) && (
          <p className="form-error ic-list-error">{loadError ?? error}</p>
        )}

        <div className="ic-list-scroll">
          <div className="ic-list-head" aria-hidden="true">
            <span>邀请码</span>
            <span>拉新同学</span>
            <span>状态</span>
            <span>注册</span>
            <span>性别分布</span>
            <span>操作</span>
          </div>

          {codes.length === 0 ? (
            <div className="ic-list-empty admin-empty-state">
              {submittedSearch.trim() || status
                ? "没有找到匹配的邀请码。"
                : "还没有邀请码，在上方输入姓名生成第一个。"}
            </div>
          ) : (
            <ul className="ic-list">
              {codes.map((item) => (
                <InviteCodeRow
                  key={item.id}
                  item={item}
                  pending={pending}
                  onToggle={(row) => void toggleActive(row)}
                />
              ))}
            </ul>
          )}
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
      </section>
    </div>
  );
}
