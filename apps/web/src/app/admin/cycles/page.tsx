"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import {
  chinaStandardDatetimeLocalValueFromIso,
  chinaStandardDatetimeToIso,
  formatChinaStandardDateTime,
} from "@/lib/china-standard-time";
import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type {
  AdminCycle,
  AdminCycleDetail,
  AdminCyclePreview,
  AuditLogEntry,
  CycleMatchDetail,
  CycleParticipantDetail,
  PaginatedResult,
} from "../types";

const adminStyles = [commonStyles];

const STATUS_STYLES: Record<AdminCycle["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--sage-soft)", color: "var(--sage)" },
  PREPARING: { bg: "rgba(191, 219, 254, 0.35)", color: "#1d4ed8" },
  DRAFT: { bg: "var(--color-gold-soft)", color: "#8a6d2b" },
  REVEAL_READY: { bg: "var(--color-accent-soft)", color: "var(--color-accent-ink)" },
  REVEALED: { bg: "var(--color-coral-soft)", color: "var(--color-coral)" },
};

const CYCLE_STATUS_LABELS: Record<"ALL" | AdminCycle["status"], string> = {
  ALL: "全部",
  DRAFT: "草稿",
  OPEN: "开放报名",
  PREPARING: "预生成中",
  REVEAL_READY: "待揭晓",
  REVEALED: "已揭晓",
};
const EDITABLE_CYCLE_STATUSES = [
  "DRAFT",
  "OPEN",
] as const;

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

function formatParticipantIntent(participant: CycleParticipantDetail) {
  if (participant.status !== "OPTED_IN") {
    return "—";
  }

  if (!participant.intent) {
    return "未选择";
  }

  const labels = WEEKLY_INTENT_LABELS[participant.intent];
  return `${labels.subtitle} (${participant.intent})`;
}

function buildAdminQueryString(
  params: Record<string, string | number | undefined>,
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

export default function AdminCyclesPage() {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminCycle["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [cycleDataRefreshKey, setCycleDataRefreshKey] = useState(0);
  const [cycleForm, setCycleForm] = useState(createEmptyCycleForm);
  const [cycleDetail, setCycleDetail] = useState<AdminCycleDetail | null>(null);
  const [participantsData, setParticipantsData] = useState<PaginatedResult<CycleParticipantDetail> | null>(null);
  const [matchesData, setMatchesData] = useState<PaginatedResult<CycleMatchDetail> | null>(null);
  const [logsData, setLogsData] = useState<PaginatedResult<AuditLogEntry> | null>(null);
  const [cyclePreview, setCyclePreview] = useState<AdminCyclePreview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [participantFilter, setParticipantFilter] = useState<"ALL" | "OPTED_IN" | "OPTED_OUT">("ALL");
  const [participantPage, setParticipantPage] = useState(1);
  const [matchPage, setMatchPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [pairPage, setPairPage] = useState(1);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AdminCycle>(
    "/admin/cycles",
    {
      page,
      pageSize: 10,
      search: submittedSearch.trim(),
      status: statusFilter === "ALL" ? undefined : statusFilter,
    },
  );
  const cycles = useMemo(() => data?.items ?? [], [data]);
  const PAGE_SIZE_PARTICIPANTS = 10;
  const PAGE_SIZE_MATCHES = 6;
  const PAGE_SIZE_LOGS = 10;
  const PAGE_SIZE_PAIRS = 6;

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
  const isSystemLockedCycleStatus =
    cycleForm.status === "PREPARING" ||
    cycleForm.status === "REVEAL_READY" ||
    cycleForm.status === "REVEALED";

  useEffect(() => {
    if (!selectedCycle) {
      setCycleForm(createEmptyCycleForm());
      setCycleDetail(null);
      setParticipantsData(null);
      setMatchesData(null);
      setLogsData(null);
      setCyclePreview(null);
      return;
    }

    setCycleForm({
      cycleId: selectedCycle.id,
      codename: selectedCycle.codename,
      participationDeadline: chinaStandardDatetimeLocalValueFromIso(
        selectedCycle.participationDeadline,
      ),
      revealAt: chinaStandardDatetimeLocalValueFromIso(selectedCycle.revealAt),
      status: selectedCycle.status,
      notes: selectedCycle.notes ?? "",
    });
    setParticipantPage(1);
    setMatchPage(1);
    setLogPage(1);
    setPairPage(1);
    setExpandedMatchId(null);
    setParticipantFilter("ALL");
  }, [selectedCycle]);

  useEffect(() => {
    setExpandedMatchId(null);
  }, [matchPage, selectedCycleId]);

  async function loadCycleSummary(cycleId: string) {
    const detail = await fetchApi<AdminCycleDetail>(`/admin/cycles/${cycleId}`);
    setCycleDetail(detail);
    return detail;
  }

  function refreshSelectedCycleDataViews() {
    setCycleDataRefreshKey((currentValue) => currentValue + 1);
  }

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setCycleDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    loadCycleSummary(selectedCycleId)
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

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setParticipantsData(null);
      return;
    }

    let active = true;
    setParticipantsLoading(true);

    fetchApi<PaginatedResult<CycleParticipantDetail>>(
      `/admin/cycles/${selectedCycleId}/participants${buildAdminQueryString({
        page: participantPage,
        pageSize: PAGE_SIZE_PARTICIPANTS,
        status: participantFilter === "ALL" ? undefined : participantFilter,
      })}`,
    )
      .then((result) => {
        if (active) {
          setParticipantsData(result);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次参与者加载失败。",
          );
        }
      })
      .finally(() => {
        if (active) {
          setParticipantsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cycleDataRefreshKey, participantFilter, participantPage, selectedCycleId]);

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setMatchesData(null);
      return;
    }

    let active = true;
    setMatchesLoading(true);

    fetchApi<PaginatedResult<CycleMatchDetail>>(
      `/admin/cycles/${selectedCycleId}/matches${buildAdminQueryString({
        page: matchPage,
        pageSize: PAGE_SIZE_MATCHES,
      })}`,
    )
      .then((result) => {
        if (active) {
          setMatchesData(result);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次匹配结果加载失败。",
          );
        }
      })
      .finally(() => {
        if (active) {
          setMatchesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cycleDataRefreshKey, matchPage, selectedCycleId]);

  useEffect(() => {
    if (!isExistingCycleSelection(selectedCycleId)) {
      setLogsData(null);
      return;
    }

    let active = true;
    setLogsLoading(true);

    fetchApi<PaginatedResult<AuditLogEntry>>(
      `/admin/cycles/${selectedCycleId}/logs${buildAdminQueryString({
        page: logPage,
        pageSize: PAGE_SIZE_LOGS,
      })}`,
    )
      .then((result) => {
        if (active) {
          setLogsData(result);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次日志加载失败。",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLogsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cycleDataRefreshKey, logPage, selectedCycleId]);

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setActionMessage(null);

    if (cycleForm.status === "PREPARING") {
      setActionError("PREPARING 是系统内部状态，不能通过后台表单手动保存。");
      return;
    }

    if (cycleForm.status === "REVEALED" && selectedCycle?.status !== "REVEALED") {
      setActionError("REVEALED 必须通过执行轮次来设置，不能通过后台表单手动保存。");
      return;
    }

    if (
      cycleForm.status === "REVEAL_READY" &&
      selectedCycle?.status !== "REVEAL_READY"
    ) {
      setActionError("REVEAL_READY 必须通过预生成流程设置，不能通过后台表单手动保存。");
      return;
    }

    const participationDeadline = chinaStandardDatetimeToIso(
      cycleForm.participationDeadline,
    );
    const revealAt = chinaStandardDatetimeToIso(cycleForm.revealAt);
    if (!participationDeadline || !revealAt) {
      setActionError("请填写有效的北京时间（参与截止与揭晓时间）。");
      return;
    }

    setPending("save");

    try {
      const saved = await fetchApi<AdminCycle>("/admin/cycles", {
        method: "PUT",
        body: JSON.stringify({
          ...cycleForm,
          participationDeadline,
          revealAt,
          cycleId: cycleForm.cycleId || undefined,
        }),
      });
      setActionMessage(cycleForm.cycleId ? "轮次已更新。" : "轮次已创建。");
      await refresh();
      setSelectedCycleId(saved.id);
      await loadCycleSummary(saved.id);
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
        await loadCycleSummary(selectedCycleId);
        refreshSelectedCycleDataViews();
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    submitSearch();
  }

  if (loading) {
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载轮次中心...</div>;
  }

  return (
    <div className={cx(adminStyles, "qb-container")} style={{ maxWidth: "72rem" }}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>轮次中心</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>管理轮次列表、编辑详情、执行匹配和查看阶段状态。</p>
        </div>
        <div className="auth-actions">
          <button
            className="ui-button ui-button--secondary"
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
          <button className="ui-button ui-button--secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.4rem", padding: "0 1rem" }}>
            刷新
          </button>
        </div>
      </div>

      {error ? <p className="ui-form-message ui-form-message--error" style={{ marginBottom: "0.75rem" }}>{error}</p> : null}
      {actionError ? <p className="ui-form-message ui-form-message--error" style={{ marginBottom: "0.75rem" }}>{actionError}</p> : null}
      {actionMessage ? <p className="ui-form-message ui-form-message--success" style={{ marginBottom: "0.75rem" }}>{actionMessage}</p> : null}

      <section className={cx(adminStyles, "admin-workspace-grid")}>
        {/* ── Cycle list ─── */}
        <article className={cx(adminStyles, "ui-card ui-card--padded ui-card--plain admin-list-panel")}>
          <div className={cx(adminStyles, "admin-section-header")}>
            <div>
              <p className="eyebrow">轮次列表</p>
              <h2>全部轮次</h2>
            </div>
          </div>
          <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索 codename、状态或备注"
            />
          </form>
          <div className={cx(adminStyles, "admin-tabs")}>
            {(["ALL", "DRAFT", "OPEN", "PREPARING", "REVEAL_READY", "REVEALED"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={statusFilter === s ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => { setStatusFilter(s); setPage(1); }}
              >
                {CYCLE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className={cx(adminStyles, "admin-record-list")}>
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                className={cx(
                  adminStyles,
                  "admin-record-item",
                  cycle.id === selectedCycleId && "admin-record-item-active",
                )}
                onClick={() => setSelectedCycleId(cycle.id)}
              >
                <div className={cx(adminStyles, "admin-record-topline")}>
                  <strong>{cycle.codename}</strong>
                  <span className="ui-badge ui-badge--neutral" style={STATUS_STYLES[cycle.status]}>{CYCLE_STATUS_LABELS[cycle.status]}</span>
                </div>
                <p>揭晓：{formatChinaStandardDateTime(cycle.revealAt)}</p>
                <div className={cx(adminStyles, "admin-inline-meta")}>
                  <span>可匹配人数 {cycle._count.participations}</span>
                  <span>匹配数 {cycle._count.matches}</span>
                </div>
              </button>
            ))}
            {cycles.length === 0 && <div className={cx(adminStyles, "admin-empty-state")}>没有找到匹配的轮次。</div>}
          </div>
          {data && (
            <AdminPagination
              className={cx(adminStyles, "admin-pagination")}
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              unit="个轮次"
              onPageChange={setPage}
            />
          )}
        </article>

        {/* ── Cycle editor ─── */}
        <article className={cx(adminStyles, "ui-card ui-card--padded ui-card--plain admin-detail-panel")}>
          <div className={cx(adminStyles, "admin-section-header")}>
            <div>
              <p className="eyebrow">轮次编辑</p>
              <h2>{cycleForm.cycleId ? "编辑轮次" : "新建轮次"}</h2>
            </div>
          </div>

          {selectedCycle && (
            <>
              <div className={cx(adminStyles, "adm-action-toolbar")}>
                <div className={cx(adminStyles, "adm-action-group")}>
                  <span className={cx(adminStyles, "adm-action-label")}>管理</span>
                  <button className="ui-button ui-button--secondary" type="button" disabled={pending === "duplicate"} onClick={() => void duplicateCycle()}>
                    {pending === "duplicate" ? "复制中…" : "复制为草稿"}
                  </button>
                  <button className="ui-button ui-button--secondary" type="button" disabled={!cycleDetail} onClick={exportCycleDetail}>导出详情</button>
                </div>
                <div className={cx(adminStyles, "adm-action-group")}>
                  <span className={cx(adminStyles, "adm-action-label")}>执行</span>
                  <button className="ui-button ui-button--secondary" type="button" disabled={pending === "preview"} onClick={() => void previewCycle()}>
                    {pending === "preview" ? "预演中…" : "预演匹配"}
                  </button>
                  <button className="ui-button ui-button--primary" type="button" disabled={pending === "run"} onClick={() => void runCycle(false)}>
                    {pending === "run" ? "执行中…" : "正常执行"}
                  </button>
                  <button className="ui-button ui-button--ghost" type="button" disabled={pending === "force-run"} onClick={() => void runCycle(true)}>
                    {pending === "force-run" ? "强制中…" : "强制执行"}
                  </button>
                </div>
              </div>
              <p className={cx(adminStyles, "adm-action-hint")}>
                提示：强制执行会先删除本周期已有匹配再重新生成；请仅在未到揭晓时间或需纠正数据时使用。
              </p>
            </>
          )}

          {selectedCycle && (
            <div className={cx(adminStyles, "admin-inline-metrics")}>
              <div><span>状态</span><strong>{CYCLE_STATUS_LABELS[selectedCycle.status]}</strong></div>
              <div><span>可匹配人数</span><strong>{selectedCycle._count.participations}</strong></div>
              <div><span>匹配数</span><strong>{selectedCycle._count.matches}</strong></div>
            </div>
          )}

          <form className="auth-stack" onSubmit={saveCycle}>
            <label>
              <span>轮次代号</span>
              <input required value={cycleForm.codename} onChange={(e) => setCycleForm((f) => ({ ...f, codename: e.target.value }))} />
            </label>
            <div className={cx(adminStyles, "admin-form-grid")}>
              <label>
                <span>参与截止（北京时间）</span>
                <input required type="datetime-local" value={cycleForm.participationDeadline} onChange={(e) => setCycleForm((f) => ({ ...f, participationDeadline: e.target.value }))} />
              </label>
              <label>
                <span>揭晓时间（北京时间）</span>
                <input required type="datetime-local" value={cycleForm.revealAt} onChange={(e) => setCycleForm((f) => ({ ...f, revealAt: e.target.value }))} />
              </label>
            </div>
            <label>
              <span>状态</span>
              <select
                value={cycleForm.status}
                disabled={isSystemLockedCycleStatus}
                onChange={(e) => setCycleForm((f) => ({ ...f, status: e.target.value as AdminCycle["status"] }))}
              >
                {cycleForm.status === "PREPARING" ? (
                  <option value="PREPARING" disabled>
                    预生成中（系统状态）
                  </option>
                ) : null}
                {cycleForm.status === "REVEALED" ? (
                  <option value="REVEALED" disabled>
                    已揭晓（系统状态）
                  </option>
                ) : null}
                {cycleForm.status === "REVEAL_READY" ? (
                  <option value="REVEAL_READY" disabled>
                    待揭晓（系统状态）
                  </option>
                ) : null}
                {EDITABLE_CYCLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {CYCLE_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>备注</span>
              <textarea rows={4} value={cycleForm.notes} onChange={(e) => setCycleForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <button className="ui-button ui-button--primary" type="submit" disabled={pending === "save"}>
              {pending === "save" ? "保存中..." : cycleForm.cycleId ? "保存轮次" : "创建轮次"}
            </button>
          </form>
        </article>
      </section>

      {/* ── Participants (compact table) ─────────────────── */}
      <section className="ui-card ui-card--padded ui-card--plain" style={{ marginTop: "1.25rem" }}>
        <div className={cx(adminStyles, "admin-section-header")}>
          <div>
            <p className="eyebrow">参与者</p>
            <h2>参与者与完成度</h2>
          </div>
        </div>

        {detailLoading ? (
          <div className={cx(adminStyles, "admin-empty-state")}>正在加载轮次详情...</div>
        ) : cycleDetail ? (
          <div className={cx(adminStyles, "admin-page-stack")}>
            <div className={cx(adminStyles, "admin-inline-metrics")}>
              <div><span>总参与</span><strong>{cycleDetail.summary.participationCount}</strong></div>
              <div><span>可匹配人数</span><strong>{cycleDetail.summary.matchableParticipantCount}</strong></div>
              <div><span>已提交问卷</span><strong>{cycleDetail.summary.submittedQuestionnaireCount}</strong></div>
              <div><span>未提交问卷</span><strong>{cycleDetail.summary.participationCount - cycleDetail.summary.submittedQuestionnaireCount}</strong></div>
            </div>

            <div className={cx(adminStyles, "admin-tabs")}>
              {(["ALL", "OPTED_IN", "OPTED_OUT"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={participantFilter === f ? "ui-segmented-item active" : "ui-segmented-item"}
                  onClick={() => { setParticipantFilter(f); setParticipantPage(1); }}
                >
                  {f === "ALL" ? "全部" : PARTICIPATION_STATUS_LABELS[f]}
                </button>
              ))}
            </div>

            {participantsLoading ? (
              <div className={cx(adminStyles, "admin-empty-state")}>正在加载参与者列表...</div>
            ) : participantsData && participantsData.items.length > 0 ? (
              <div className={cx(adminStyles, "admin-table-wrap")}>
                <table className={cx(adminStyles, "admin-table")}>
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>学校</th>
                      <th>状态</th>
                      <th>本周意图</th>
                      <th>问卷</th>
                      <th>加入时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantsData.items.map((p) => (
                      <tr key={p.id}>
                        <td><strong style={{ fontSize: "0.88rem" }}>{p.user.displayName ?? p.user.email}</strong></td>
                        <td>{p.user.school?.name ?? "—"}</td>
                        <td><span className="ui-badge ui-badge--neutral">{PARTICIPATION_STATUS_LABELS[p.status]}</span></td>
                        <td>{formatParticipantIntent(p)}</td>
                        <td>
                          {p.user.questionnaireResponse?.submittedAt
                            ? <span style={{ color: "var(--sage)" }}>已提交</span>
                            : <span style={{ color: "var(--color-coral)" }}>未提交</span>}
                        </td>
                        <td>{p.optedInAt ? formatChinaStandardDateTime(p.optedInAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={cx(adminStyles, "admin-empty-state")}>当前筛选条件下没有参与者。</div>
            )}

            {participantsData && participantsData.totalPages > 1 && (
              <AdminPagination
                className={cx(adminStyles, "admin-pagination")}
                page={participantsData.page}
                totalPages={participantsData.totalPages}
                total={participantsData.total}
                unit="人"
                onPageChange={setParticipantPage}
              />
            )}
          </div>
        ) : (
          <div className={cx(adminStyles, "admin-empty-state")}>选择轮次后查看参与者列表。</div>
        )}
      </section>

      {/* ── Matches & logs ───────────────────────────────── */}
      <section className="ui-card ui-card--padded ui-card--plain" style={{ marginTop: "1.25rem" }}>
        <div className={cx(adminStyles, "admin-section-header")}>
          <div>
            <p className="eyebrow">匹配结果</p>
            <h2>匹配结果与执行记录</h2>
          </div>
        </div>

        {detailLoading ? (
          <div className={cx(adminStyles, "admin-empty-state")}>正在加载匹配结果...</div>
        ) : cycleDetail ? (
          <div className={cx(adminStyles, "admin-page-stack")}>
            <div className={cx(adminStyles, "admin-inline-metrics")}>
              <div><span>总参与</span><strong>{cycleDetail.summary.participationCount}</strong></div>
              <div><span>可匹配人数</span><strong>{cycleDetail.summary.matchableParticipantCount}</strong></div>
              <div><span>匹配对数</span><strong>{cycleDetail.summary.matchedPairCount}</strong></div>
              <div><span>待联系</span><strong>{cycleDetail.summary.pendingContactCount}</strong></div>
            </div>

            {matchesLoading ? (
              <div className={cx(adminStyles, "admin-empty-state")}>正在加载匹配结果...</div>
            ) : matchesData && matchesData.items.length > 0 ? (
              <>
                <div className={cx(adminStyles, "admin-record-list")}>
                  {matchesData.items.map((match) => {
                    const isExpanded = expandedMatchId === match.id;

                    return (
                    <div key={match.id} className={cx(adminStyles, "admin-record-item")}>
                      <div className={cx(adminStyles, "admin-record-topline")}>
                        <strong>{match.participants.map((p) => p.user.displayName ?? p.user.email).join(" × ")}</strong>
                        <span className="ui-badge ui-badge--neutral">分数 {match.score.toFixed(1)}</span>
                      </div>
                      <div className={cx(adminStyles, "admin-inline-meta")}>
                        <span>揭晓：{match.revealedAt ? formatChinaStandardDateTime(match.revealedAt) : "待揭晓"}</span>
                        <span>引荐：{match.introducedAt ? formatChinaStandardDateTime(match.introducedAt) : "未引荐"}</span>
                        <span>举报数：{match.reports.length}</span>
                        <span>反馈数：{match.feedback.length}</span>
                      </div>
                      <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
                        <button
                          className="ui-button ui-button--secondary"
                          type="button"
                          onClick={() => setExpandedMatchId(isExpanded ? null : match.id)}
                        >
                          {isExpanded ? "收起反馈" : "查看反馈"}
                        </button>
                      </div>
                      {isExpanded ? (
                        match.feedback.length > 0 ? (
                          <ul className={cx(adminStyles, "admin-reason-list")} style={{ marginTop: "0.75rem" }}>
                            {match.feedback.map((fb) => {
                              const author = match.participants.find(
                                (p) => p.userId === fb.authorUserId,
                              );
                              const authorName =
                                author?.user.displayName ??
                                author?.user.email ??
                                fb.authorUserId;
                              return (
                                <li key={fb.id}>
                                  {authorName} 评分 {fb.rating}/5
                                  {fb.comment ? `：${fb.comment}` : ""}
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p style={{ margin: "0.75rem 0 0" }}>
                            双方暂未提交反馈评价。
                          </p>
                        )
                      ) : null}
                    </div>
                  )})}
                </div>
                {matchesData.totalPages > 1 && (
                  <AdminPagination
                    className={cx(adminStyles, "admin-pagination")}
                    page={matchesData.page}
                    totalPages={matchesData.totalPages}
                    total={matchesData.total}
                    unit="组"
                    onPageChange={setMatchPage}
                  />
                )}
              </>
            ) : (
              <div className={cx(adminStyles, "admin-empty-state")}>当前轮次还没有生成匹配。</div>
            )}

            <div>
              <h3>运行记录</h3>
              {logsLoading ? (
                <div className={cx(adminStyles, "admin-empty-state")}>正在加载运行日志...</div>
              ) : logsData && logsData.items.length > 0 ? (
                <>
                  <div className={cx(adminStyles, "admin-record-list")}>
                    {logsData.items.map((log) => (
                      <div key={log.id} className={cx(adminStyles, "admin-record-item")}>
                        <div className={cx(adminStyles, "admin-record-topline")}>
                          <strong>{log.action}</strong>
                          <span className="ui-badge ui-badge--neutral">{formatChinaStandardDateTime(log.createdAt)}</span>
                        </div>
                        <p>{JSON.stringify(log.metadata ?? {})}</p>
                      </div>
                    ))}
                  </div>
                  {logsData.totalPages > 1 && (
                    <AdminPagination
                      className={cx(adminStyles, "admin-pagination")}
                      page={logsData.page}
                      totalPages={logsData.totalPages}
                      total={logsData.total}
                      unit="条"
                      onPageChange={setLogPage}
                    />
                  )}
                </>
              ) : (
                <div className={cx(adminStyles, "admin-empty-state")}>当前轮次还没有运行日志。</div>
              )}
            </div>
          </div>
        ) : (
          <div className={cx(adminStyles, "admin-empty-state")}>选择轮次后查看匹配结果。</div>
        )}
      </section>

      {/* ── Preview ──────────────────────────────────────── */}
      <section className="ui-card ui-card--padded ui-card--plain" style={{ marginTop: "1.25rem" }}>
        <div className={cx(adminStyles, "admin-section-header")}>
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
            <div className={cx(adminStyles, "admin-page-stack")}>
              <div className={cx(adminStyles, "admin-inline-metrics")}>
                <div><span>候选组合</span><strong>{cyclePreview.totalCandidateCount ?? cyclePreview.candidates.length}</strong></div>
                <div><span>建议匹配</span><strong>{allP.length}</strong></div>
                <div><span>未匹配用户</span><strong>{cyclePreview.unmatchedUserIds.length}</strong></div>
              </div>

              <div className={cx(adminStyles, "admin-record-list")}>
                {visibleP.map((pair) => (
                  <div key={`${pair.leftUserId}-${pair.rightUserId}`} className={cx(adminStyles, "admin-record-item")}>
                    <div className={cx(adminStyles, "admin-record-topline")}>
                      <strong>{pair.leftDisplayName ?? pair.leftUserId} × {pair.rightDisplayName ?? pair.rightUserId}</strong>
                      <span className="ui-badge ui-badge--neutral">分数 {pair.score.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
                {allP.length === 0 && <div className={cx(adminStyles, "admin-empty-state")}>当前没有建议匹配。</div>}
              </div>

              {pTotalPages > 1 && (
                <AdminPagination
                  className={cx(adminStyles, "admin-pagination")}
                  page={pSafePage}
                  totalPages={pTotalPages}
                  total={allP.length}
                  unit="组"
                  onPageChange={setPairPage}
                />
              )}
            </div>
          );
        })() : (
          <div className={cx(adminStyles, "admin-empty-state")}>先选择轮次，再点击「预演匹配」。</div>
        )}
      </section>
    </div>
  );
}
