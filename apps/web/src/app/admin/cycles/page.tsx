"use client";

import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import type { AdminCycle, AdminCycleDetail, AdminCyclePreview } from "../types";

const STATUS_STYLES: Record<AdminCycle["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--sage-soft)", color: "var(--sage)" },
  DRAFT: { bg: "var(--gold-soft)", color: "#8a6d2b" },
  REVEAL_READY: { bg: "var(--accent-soft)", color: "var(--accent-text)" },
  REVEALED: { bg: "var(--coral-soft)", color: "var(--coral)" },
};

const CYCLE_STATUS_LABELS: Record<"ALL" | AdminCycle["status"], string> = {
  ALL: "全部",
  DRAFT: "草稿",
  OPEN: "开放报名",
  REVEAL_READY: "待揭晓",
  REVEALED: "已揭晓",
};

const PARTICIPATION_STATUS_LABELS: Record<"OPTED_IN" | "OPTED_OUT", string> = {
  OPTED_IN: "已参加",
  OPTED_OUT: "未参加",
};

/** Sentinel: list selection while creating a cycle (must not match a real id). */
const ADMIN_NEW_CYCLE_SELECTION = "__admin_new_cycle__";

function createEmptyCycleForm() {
  return {
    cycleId: "",
    codename: "",
    participationDeadline: "",
    revealAt: "",
    status: "DRAFT" as AdminCycle["status"],
    notes: "",
  };
}

function isExistingCycleSelection(id: string | null): id is string {
  return Boolean(id) && id !== ADMIN_NEW_CYCLE_SELECTION;
}

function toDateTimeInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminCyclesPage() {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminCycle["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [cycleForm, setCycleForm] = useState(createEmptyCycleForm);
  const [cycleDetail, setCycleDetail] = useState<AdminCycleDetail | null>(null);
  const [cyclePreview, setCyclePreview] = useState<AdminCyclePreview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [participantFilter, setParticipantFilter] = useState<"ALL" | "OPTED_IN" | "OPTED_OUT">("ALL");
  const [participantPage, setParticipantPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [pairPage, setPairPage] = useState(1);

  const deferredSearch = useDeferredValue(search);
  const { data, loading, error, refresh } = useAdminCollection<AdminCycle>(
    "/admin/cycles",
    {
      page,
      pageSize: 10,
      search: deferredSearch.trim(),
      status: statusFilter === "ALL" ? undefined : statusFilter,
    },
  );
  const cycles = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (!cycles.length) {
      setSelectedCycleId(null);
      return;
    }

    if (selectedCycleId === ADMIN_NEW_CYCLE_SELECTION) {
      return;
    }

    if (!selectedCycleId || !cycles.some((cycle) => cycle.id === selectedCycleId)) {
      setSelectedCycleId(cycles[0].id);
    }
  }, [cycles, selectedCycleId]);

  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;

  useEffect(() => {
    if (!selectedCycle) {
      setCycleForm(createEmptyCycleForm());
      setCycleDetail(null);
      setCyclePreview(null);
      return;
    }

    setCycleForm({
      cycleId: selectedCycle.id,
      codename: selectedCycle.codename,
      participationDeadline: toDateTimeInput(selectedCycle.participationDeadline),
      revealAt: toDateTimeInput(selectedCycle.revealAt),
      status: selectedCycle.status,
      notes: selectedCycle.notes ?? "",
    });
    setParticipantPage(1);
    setMatchPage(1);
    setLogPage(1);
    setPairPage(1);
    setParticipantFilter("ALL");
  }, [selectedCycle]);

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setCycleDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    fetchApi<AdminCycleDetail>(`/admin/cycles/${selectedCycleId}`)
      .then((detail) => {
        if (!active) return;
        setCycleDetail(detail);
        setCyclePreview(null);
      })
      .catch((caughtError) => {
        if (!active) return;
        setActionError(
          caughtError instanceof Error ? caughtError.message : "轮次详情加载失败。",
        );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => { active = false; };
  }, [selectedCycleId]);

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setActionError(null);
    setActionMessage(null);

    try {
      const saved = await fetchApi<AdminCycle>("/admin/cycles", {
        method: "PUT",
        body: JSON.stringify({
          ...cycleForm,
          cycleId: cycleForm.cycleId || undefined,
        }),
      });
      setActionMessage(cycleForm.cycleId ? "轮次已更新。" : "轮次已创建。");
      await refresh();
      setSelectedCycleId(saved.id);
      const detail = await fetchApi<AdminCycleDetail>(`/admin/cycles/${saved.id}`);
      setCycleDetail(detail);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次保存失败。");
    } finally {
      setPending(null);
    }
  }

  async function runCycle(force: boolean) {
    if (!isExistingCycleSelection(selectedCycleId)) return;

    const confirmed = window.confirm(
      force
        ? "强制执行会跳过揭晓时间检查；若本周期已有匹配记录，将先全部删除再重新生成。此操作不可撤销。确认继续吗？"
        : "执行轮次会开始生成正式匹配结果。确认继续吗？",
    );
    if (!confirmed) return;

    setPending(force ? "force-run" : "run");
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await fetchApi<{ ok: boolean; message?: string; createdMatches?: number }>(
        "/admin/cycles/run",
        { method: "POST", body: JSON.stringify({ cycleId: selectedCycleId, force }) },
      );
      setActionMessage(
        result.message ??
          (typeof result.createdMatches === "number"
            ? `轮次已执行，生成 ${result.createdMatches} 组匹配。`
            : "轮次执行完成。"),
      );
      await refresh();
      if (selectedCycleId) {
        const detail = await fetchApi<AdminCycleDetail>(`/admin/cycles/${selectedCycleId}`);
        setCycleDetail(detail);
      }
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次执行失败。");
    } finally {
      setPending(null);
    }
  }

  async function duplicateCycle() {
    if (!isExistingCycleSelection(selectedCycleId)) return;
    setPending("duplicate");
    setActionError(null);
    setActionMessage(null);

    try {
      const duplicate = await fetchApi<AdminCycle>(`/admin/cycles/${selectedCycleId}/duplicate`, { method: "POST" });
      setActionMessage(`已复制轮次 ${duplicate.codename}，状态为 DRAFT。`);
      setPage(1);
      await refresh();
      setSelectedCycleId(duplicate.id);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次复制失败。");
    } finally {
      setPending(null);
    }
  }

  async function previewCycle() {
    if (!isExistingCycleSelection(selectedCycleId)) return;
    setPending("preview");
    setActionError(null);
    setActionMessage(null);

    try {
      const preview = await fetchApi<AdminCyclePreview>(`/admin/cycles/${selectedCycleId}/preview`);
      setCyclePreview(preview);
      setActionMessage(preview.message ?? "预演结果已生成。");
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次预演失败。");
    } finally {
      setPending(null);
    }
  }

  function exportCycleDetail() {
    if (!cycleDetail) return;
    const blob = new Blob([JSON.stringify(cycleDetail, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${cycleDetail.cycle.codename}-detail.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="admin-empty-state">正在加载轮次中心...</div>;
  }

  const PAGE_SIZE_PARTICIPANTS = 10;
  const PAGE_SIZE_MATCHES = 6;
  const PAGE_SIZE_LOGS = 10;
  const PAGE_SIZE_PAIRS = 6;

  return (
    <div className="qb-container" style={{ maxWidth: "72rem" }}>
      <div className="qb-header">
        <div>
          <h1>轮次中心</h1>
          <p className="qb-header-desc">管理轮次列表、编辑详情、执行匹配和查看阶段状态。</p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={() => {
              setSelectedCycleId(ADMIN_NEW_CYCLE_SELECTION);
              setCycleForm(createEmptyCycleForm());
              setCycleDetail(null);
              setCyclePreview(null);
              setActionMessage(null);
              setActionError(null);
            }}
            type="button"
            style={{ minHeight: "2.4rem", padding: "0 1rem" }}
          >
            新建轮次
          </button>
          <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.4rem", padding: "0 1rem" }}>
            刷新
          </button>
        </div>
      </div>

      {error ? <p className="form-error" style={{ marginBottom: "0.75rem" }}>{error}</p> : null}
      {actionError ? <p className="form-error" style={{ marginBottom: "0.75rem" }}>{actionError}</p> : null}
      {actionMessage ? <p className="form-success" style={{ marginBottom: "0.75rem" }}>{actionMessage}</p> : null}

      <section className="admin-workspace-grid">
        {/* ── Cycle list ─── */}
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">轮次列表</p>
              <h2>全部轮次</h2>
            </div>
          </div>
          <div className="admin-search-bar">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="搜索 codename、状态或备注"
            />
          </div>
          <div className="admin-tabs">
            {(["ALL", "DRAFT", "OPEN", "REVEAL_READY", "REVEALED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "admin-tab active" : "admin-tab"}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {CYCLE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="admin-record-list">
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                className={cycle.id === selectedCycleId ? "admin-record-item admin-record-item-active" : "admin-record-item"}
                onClick={() => setSelectedCycleId(cycle.id)}
              >
                <div className="admin-record-topline">
                  <strong>{cycle.codename}</strong>
                  <span className="domain-chip" style={STATUS_STYLES[cycle.status]}>{CYCLE_STATUS_LABELS[cycle.status]}</span>
                </div>
                <p>揭晓：{formatDateTime(cycle.revealAt)}</p>
                <div className="admin-inline-meta">
                  <span>参与记录 {cycle._count.participations}</span>
                  <span>匹配数 {cycle._count.matches}</span>
                </div>
              </button>
            ))}
            {cycles.length === 0 && <div className="admin-empty-state">没有找到匹配的轮次。</div>}
          </div>
          {data && (
            <div className="admin-pagination">
              <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">上一页</button>
              <span>{data.page} / {data.totalPages} · 共 {data.total} 个轮次</span>
              <button disabled={data.page >= data.totalPages} onClick={() => setPage(data.page + 1)} type="button">下一页</button>
            </div>
          )}
        </article>

        {/* ── Cycle editor ─── */}
        <article className="content-panel admin-detail-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">轮次编辑</p>
              <h2>{cycleForm.cycleId ? "编辑轮次" : "新建轮次"}</h2>
            </div>
          </div>

          {selectedCycle && (
            <div className="adm-action-toolbar">
              <div className="adm-action-group">
                <span className="adm-action-label">管理</span>
                <button className="button-secondary" type="button" disabled={pending === "duplicate"} onClick={() => void duplicateCycle()}>
                  {pending === "duplicate" ? "复制中…" : "复制为草稿"}
                </button>
                <button className="button-secondary" type="button" disabled={!cycleDetail} onClick={exportCycleDetail}>导出详情</button>
              </div>
              <div className="adm-action-group">
                <span className="adm-action-label">执行</span>
                <button className="button-secondary" type="button" disabled={pending === "preview"} onClick={() => void previewCycle()}>
                  {pending === "preview" ? "预演中…" : "预演匹配"}
                </button>
                <button className="button-primary" type="button" disabled={pending === "run"} onClick={() => void runCycle(false)}>
                  {pending === "run" ? "执行中…" : "正常执行"}
                </button>
                <button className="button-ghost" type="button" disabled={pending === "force-run"} onClick={() => void runCycle(true)}>
                  {pending === "force-run" ? "强制中…" : "强制执行"}
                </button>
              </div>
              <p
                className="qb-header-desc"
                style={{ marginTop: "0.5rem", maxWidth: "42rem", color: "var(--admin-warn-text, #9a3412)" }}
              >
                提示：强制执行会先删除本周期已有匹配再重新生成；请仅在未到揭晓时间或需纠正数据时使用。
              </p>
            </div>
          )}

          {selectedCycle && (
            <div className="admin-inline-metrics">
              <div><span>状态</span><strong>{CYCLE_STATUS_LABELS[selectedCycle.status]}</strong></div>
              <div><span>参与记录</span><strong>{selectedCycle._count.participations}</strong></div>
              <div><span>匹配数</span><strong>{selectedCycle._count.matches}</strong></div>
            </div>
          )}

          <form className="auth-form" onSubmit={saveCycle}>
            <label>
              <span>轮次代号</span>
              <input required value={cycleForm.codename} onChange={(e) => setCycleForm((f) => ({ ...f, codename: e.target.value }))} />
            </label>
            <div className="form-grid">
              <label>
                <span>参与截止</span>
                <input required type="datetime-local" value={cycleForm.participationDeadline} onChange={(e) => setCycleForm((f) => ({ ...f, participationDeadline: e.target.value }))} />
              </label>
              <label>
                <span>揭晓时间</span>
                <input required type="datetime-local" value={cycleForm.revealAt} onChange={(e) => setCycleForm((f) => ({ ...f, revealAt: e.target.value }))} />
              </label>
            </div>
            <label>
              <span>状态</span>
              <select value={cycleForm.status} onChange={(e) => setCycleForm((f) => ({ ...f, status: e.target.value as AdminCycle["status"] }))}>
                <option value="DRAFT">草稿</option>
                <option value="OPEN">开放报名</option>
                <option value="REVEAL_READY">待揭晓</option>
                <option value="REVEALED">已揭晓</option>
              </select>
            </label>
            <label>
              <span>备注</span>
              <textarea rows={4} value={cycleForm.notes} onChange={(e) => setCycleForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <button className="button-primary" type="submit" disabled={pending === "save"}>
              {pending === "save" ? "保存中..." : cycleForm.cycleId ? "保存轮次" : "创建轮次"}
            </button>
          </form>
        </article>
      </section>

      {/* ── Participants (compact table) ─────────────────── */}
      <section className="content-panel" style={{ marginTop: "1.25rem" }}>
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">参与者</p>
            <h2>参与者与完成度</h2>
          </div>
        </div>

        {detailLoading ? (
          <div className="admin-empty-state">正在加载轮次详情...</div>
        ) : cycleDetail ? (() => {
          const all = cycleDetail.cycle.participations;
          const optedIn = all.filter((p) => p.status === "OPTED_IN").length;
          const withQ = all.filter((p) => p.user.questionnaireResponse?.submittedAt).length;
          const filtered = participantFilter === "ALL" ? all : all.filter((p) => p.status === participantFilter);
          const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE_PARTICIPANTS));
          const safePage = Math.min(participantPage, totalPages);
          const sliceStart = (safePage - 1) * PAGE_SIZE_PARTICIPANTS;
          const visible = filtered.slice(sliceStart, sliceStart + PAGE_SIZE_PARTICIPANTS);

          return (
            <div className="admin-page-stack">
              <div className="admin-inline-metrics">
                <div><span>总参与</span><strong>{all.length}</strong></div>
                <div><span>已 Opt-in</span><strong>{optedIn}</strong></div>
                <div><span>已提交问卷</span><strong>{withQ}</strong></div>
                <div><span>未提交问卷</span><strong>{all.length - withQ}</strong></div>
              </div>

              <div className="admin-tabs">
                {(["ALL", "OPTED_IN", "OPTED_OUT"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={participantFilter === f ? "admin-tab active" : "admin-tab"}
                    onClick={() => { setParticipantFilter(f); setParticipantPage(1); }}
                  >
                    {f === "ALL" ? `全部 (${all.length})` : `${PARTICIPATION_STATUS_LABELS[f]} (${all.filter((p) => p.status === f).length})`}
                  </button>
                ))}
              </div>

              {filtered.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>用户</th>
                        <th>学校</th>
                        <th>状态</th>
                        <th>问卷</th>
                        <th>加入时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => (
                        <tr key={p.id}>
                          <td><strong style={{ fontSize: "0.88rem" }}>{p.user.displayName ?? p.user.email}</strong></td>
                          <td>{p.user.school?.name ?? "—"}</td>
                          <td><span className="domain-chip">{PARTICIPATION_STATUS_LABELS[p.status]}</span></td>
                          <td>
                            {p.user.questionnaireResponse?.submittedAt
                              ? <span style={{ color: "var(--sage)" }}>已提交</span>
                              : <span style={{ color: "var(--coral)" }}>未提交</span>}
                          </td>
                          <td>{p.optedInAt ? formatDateTime(p.optedInAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state">当前筛选条件下没有参与者。</div>
              )}

              {totalPages > 1 && (
                <div className="admin-pagination">
                  <button disabled={safePage <= 1} onClick={() => setParticipantPage(safePage - 1)} type="button">上一页</button>
                  <span>{safePage} / {totalPages} · 共 {filtered.length} 人</span>
                  <button disabled={safePage >= totalPages} onClick={() => setParticipantPage(safePage + 1)} type="button">下一页</button>
                </div>
              )}
            </div>
          );
        })() : (
          <div className="admin-empty-state">选择轮次后查看参与者列表。</div>
        )}
      </section>

      {/* ── Matches & logs ───────────────────────────────── */}
      <section className="content-panel" style={{ marginTop: "1.25rem" }}>
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">匹配结果</p>
            <h2>匹配结果与执行记录</h2>
          </div>
        </div>

        {detailLoading ? (
          <div className="admin-empty-state">正在加载匹配结果...</div>
        ) : cycleDetail ? (() => {
          const allM = cycleDetail.cycle.matches;
          const mTotalPages = Math.max(1, Math.ceil(allM.length / PAGE_SIZE_MATCHES));
          const mSafePage = Math.min(matchPage, mTotalPages);
          const mStart = (mSafePage - 1) * PAGE_SIZE_MATCHES;
          const visibleM = allM.slice(mStart, mStart + PAGE_SIZE_MATCHES);

          const allLogs = cycleDetail.logs;
          const logTotalPages = Math.max(1, Math.ceil(allLogs.length / PAGE_SIZE_LOGS));
          const logSafePage = Math.min(logPage, logTotalPages);
          const logStart = (logSafePage - 1) * PAGE_SIZE_LOGS;
          const visibleLogs = allLogs.slice(logStart, logStart + PAGE_SIZE_LOGS);

          return (
            <div className="admin-page-stack">
              <div className="admin-inline-metrics">
                <div><span>参与人数</span><strong>{cycleDetail.summary.participationCount}</strong></div>
                <div><span>已 opt-in</span><strong>{cycleDetail.summary.optedInCount}</strong></div>
                <div><span>匹配对数</span><strong>{cycleDetail.summary.matchedPairCount}</strong></div>
                <div><span>待联系</span><strong>{cycleDetail.summary.pendingContactCount}</strong></div>
              </div>

              <div className="admin-record-list">
                {visibleM.map((match) => (
                  <div key={match.id} className="admin-record-item">
                    <div className="admin-record-topline">
                      <strong>{match.participants.map((p) => p.user.displayName ?? p.user.email).join(" × ")}</strong>
                      <span className="domain-chip">分数 {match.score.toFixed(1)}</span>
                    </div>
                    <div className="admin-inline-meta">
                      <span>引荐：{match.introducedAt ? formatDateTime(match.introducedAt) : "未引荐"}</span>
                      <span>举报数：{match.reports.length}</span>
                    </div>
                    <ul className="admin-reason-list">
                      {match.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                ))}
                {allM.length === 0 && <div className="admin-empty-state">当前轮次还没有生成匹配。</div>}
              </div>

              {mTotalPages > 1 && (
                <div className="admin-pagination">
                  <button disabled={mSafePage <= 1} onClick={() => setMatchPage(mSafePage - 1)} type="button">上一页</button>
                  <span>{mSafePage} / {mTotalPages} · 共 {allM.length} 组</span>
                  <button disabled={mSafePage >= mTotalPages} onClick={() => setMatchPage(mSafePage + 1)} type="button">下一页</button>
                </div>
              )}

              <div>
                <h3>运行记录</h3>
                <div className="admin-record-list">
                  {visibleLogs.map((log) => (
                    <div key={log.id} className="admin-record-item">
                      <div className="admin-record-topline">
                        <strong>{log.action}</strong>
                        <span className="domain-chip">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p>{JSON.stringify(log.metadata ?? {})}</p>
                    </div>
                  ))}
                  {allLogs.length === 0 && <div className="admin-empty-state">当前轮次还没有运行日志。</div>}
                </div>
                {logTotalPages > 1 && (
                  <div className="admin-pagination">
                    <button disabled={logSafePage <= 1} onClick={() => setLogPage(logSafePage - 1)} type="button">上一页</button>
                    <span>{logSafePage} / {logTotalPages} · 共 {allLogs.length} 条</span>
                    <button disabled={logSafePage >= logTotalPages} onClick={() => setLogPage(logSafePage + 1)} type="button">下一页</button>
                  </div>
                )}
              </div>
            </div>
          );
        })() : (
          <div className="admin-empty-state">选择轮次后查看匹配结果。</div>
        )}
      </section>

      {/* ── Preview ──────────────────────────────────────── */}
      <section className="content-panel" style={{ marginTop: "1.25rem" }}>
        <div className="admin-section-header">
          <div>
            <p className="eyebrow">预演</p>
            <h2>预演匹配</h2>
          </div>
        </div>

        {cyclePreview ? (() => {
          const allP = cyclePreview.suggestedPairs;
          const pTotalPages = Math.max(1, Math.ceil(allP.length / PAGE_SIZE_PAIRS));
          const pSafePage = Math.min(pairPage, pTotalPages);
          const pStart = (pSafePage - 1) * PAGE_SIZE_PAIRS;
          const visibleP = allP.slice(pStart, pStart + PAGE_SIZE_PAIRS);

          return (
            <div className="admin-page-stack">
              <div className="admin-inline-metrics">
                <div><span>候选组合</span><strong>{cyclePreview.totalCandidateCount ?? cyclePreview.candidates.length}</strong></div>
                <div><span>建议匹配</span><strong>{allP.length}</strong></div>
                <div><span>未匹配用户</span><strong>{cyclePreview.unmatchedUserIds.length}</strong></div>
              </div>

              <div className="admin-record-list">
                {visibleP.map((pair) => (
                  <div key={`${pair.leftUserId}-${pair.rightUserId}`} className="admin-record-item">
                    <div className="admin-record-topline">
                      <strong>{pair.leftDisplayName ?? pair.leftUserId} × {pair.rightDisplayName ?? pair.rightUserId}</strong>
                      <span className="domain-chip">分数 {pair.score.toFixed(1)}</span>
                    </div>
                    <ul className="admin-reason-list">
                      {pair.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                ))}
                {allP.length === 0 && <div className="admin-empty-state">当前没有建议匹配。</div>}
              </div>

              {pTotalPages > 1 && (
                <div className="admin-pagination">
                  <button disabled={pSafePage <= 1} onClick={() => setPairPage(pSafePage - 1)} type="button">上一页</button>
                  <span>{pSafePage} / {pTotalPages} · 共 {allP.length} 组</span>
                  <button disabled={pSafePage >= pTotalPages} onClick={() => setPairPage(pSafePage + 1)} type="button">下一页</button>
                </div>
              )}
            </div>
          );
        })() : (
          <div className="admin-empty-state">先选择轮次，再点击「预演匹配」。</div>
        )}
      </section>
    </div>
  );
}
