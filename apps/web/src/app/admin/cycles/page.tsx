"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AdminDetailDialog } from "../admin-detail-dialog";
import CycleStatistics from "./cycle-statistics";
import { WeeklyCycleSettings } from "./weekly-cycle-settings";
import styles from "./cycles.module.css";
import { fetchApi } from "../../../lib/api";
import {
  chinaStandardDatetimeLocalValueFromIso,
  chinaStandardDatetimeToIso,
  formatChinaStandardDateTime,
} from "@/lib/china-standard-time";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type {
  AdminCycle,
  AdminCycleDetail,
  AdminCyclePreview,
  CycleMatchDetail,
  PaginatedResult,
} from "../types";

const adminStyles = [commonStyles];

const STATUS_STYLES: Record<AdminCycle["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--sage-soft)", color: "var(--sage)" },
  PREPARING: { bg: "rgba(191, 219, 254, 0.35)", color: "#1d4ed8" },
  DRAFT: { bg: "var(--color-gold-soft)", color: "#8a6d2b" },
  REVEAL_READY: {
    bg: "var(--color-accent-soft)",
    color: "var(--color-accent-ink)",
  },
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
const EDITABLE_CYCLE_STATUSES = ["DRAFT", "OPEN"] as const;

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

function buildAdminQueryString(params: Record<string, string | number | undefined>) {
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<(AdminCycle & { participationCount: number }) | null>(null);
  const [resultTab, setResultTab] = useState<"preview" | "final">("final");
  const previewRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setCyclePreview(null);
    setCycleDetail(null);
    setMatchesData(null);
    setPending((current) => (current === "preview" ? null : current));
    setResultTab("final");
    setActionError(null);
    setActionMessage(null);
    return () => previewRequest.current?.abort();
  }, [selectedCycleId]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | AdminCycle["status"]>("ALL");
  const [page, setPage] = useState(1);
  const [cycleDataRefreshKey, setCycleDataRefreshKey] = useState(0);
  const [cycleForm, setCycleForm] = useState(createEmptyCycleForm);
  const [cycleDetail, setCycleDetail] = useState<AdminCycleDetail | null>(null);
  const [matchesData, setMatchesData] = useState<PaginatedResult<CycleMatchDetail> | null>(null);
  const [cyclePreview, setCyclePreview] = useState<AdminCyclePreview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [matchPage, setMatchPage] = useState(1);
  const [pairPage, setPairPage] = useState(1);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AdminCycle>("/admin/cycles", {
    page,
    pageSize: 10,
    search: submittedSearch.trim(),
    status: statusFilter === "ALL" ? undefined : statusFilter,
  });
  const cycles = useMemo(() => data?.items ?? [], [data]);
  const PAGE_SIZE_MATCHES = 6;
  const PAGE_SIZE_PAIRS = 6;

  useEffect(() => {
    if (selectedCycleId === ADMIN_NEW_CYCLE_SELECTION) return;
    if (!cycles.length) {
      setSelectedCycleId(null);
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
      setMatchesData(null);
      setCyclePreview(null);
      return;
    }

    setCycleForm({
      cycleId: selectedCycle.id,
      codename: selectedCycle.codename,
      participationDeadline: chinaStandardDatetimeLocalValueFromIso(
        selectedCycle.participationDeadline
      ),
      revealAt: chinaStandardDatetimeLocalValueFromIso(selectedCycle.revealAt),
      status: selectedCycle.status,
      notes: selectedCycle.notes ?? "",
    });
    setMatchPage(1);
    setPairPage(1);
    setExpandedMatchId(null);
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

    fetchApi<AdminCycleDetail>(`/admin/cycles/${selectedCycleId}`)
      .then((detail) => {
        if (!active) return;
        setCycleDetail(detail);
        setCyclePreview(null);
      })
      .catch((caughtError) => {
        if (!active) return;
        setActionError(caughtError instanceof Error ? caughtError.message : "轮次详情加载失败。");
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCycleId]);

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
      })}`
    )
      .then((result) => {
        if (active) {
          setMatchesData(result);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setActionError(
            caughtError instanceof Error ? caughtError.message : "轮次匹配结果加载失败。"
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

    if (cycleForm.status === "REVEAL_READY" && selectedCycle?.status !== "REVEAL_READY") {
      setActionError("REVEAL_READY 必须通过预生成流程设置，不能通过后台表单手动保存。");
      return;
    }

    const participationDeadline = chinaStandardDatetimeToIso(cycleForm.participationDeadline);
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
      setEditorOpen(false);
      setCyclePreview(null);
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
        : "执行轮次会开始生成正式匹配结果。确认继续吗？"
    );
    if (!confirmed) return;

    setPending(force ? "force-run" : "run");
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await fetchApi<{
        ok: boolean;
        message?: string;
        createdMatches?: number;
      }>("/admin/cycles/run", {
        method: "POST",
        body: JSON.stringify({ cycleId: selectedCycleId, force }),
      });
      setActionMessage(
        result.message ??
          (typeof result.createdMatches === "number"
            ? `轮次已执行，生成 ${result.createdMatches} 组匹配。`
            : "轮次执行完成。")
      );
      await refresh();
      if (selectedCycleId) {
        await loadCycleSummary(selectedCycleId);
        refreshSelectedCycleDataViews();
        setResultTab("final");
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
      const duplicate = await fetchApi<AdminCycle>(`/admin/cycles/${selectedCycleId}/duplicate`, {
        method: "POST",
      });
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

  async function deleteCycle() {
    if (!deleteTarget) return;
    setPending("delete");
    setActionError(null);
    setActionMessage(null);
    try {
      await fetchApi(`/admin/cycles/${deleteTarget.id}`, {
        method: "DELETE", body: JSON.stringify({ expectedParticipationCount: deleteTarget.participationCount }),
      });
      setDeleteTarget(null);
      setSelectedCycleId(null);
      setPage(1);
      await refresh();
      setActionMessage(`已删除草稿轮次“${deleteTarget.codename}”。`);
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : "删除轮次失败。");
    } finally { setPending(null); }
  }

  async function previewCycle() {
    if (!isExistingCycleSelection(selectedCycleId)) return;
    previewRequest.current?.abort();
    const controller = new AbortController();
    previewRequest.current = controller;
    setResultTab("preview");
    setPending("preview");
    setActionError(null);
    setActionMessage(null);

    try {
      const preview = await fetchApi<AdminCyclePreview>(
        `/admin/cycles/${selectedCycleId}/preview`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setPairPage(1);
      setCyclePreview(preview);
      setActionMessage(preview.message ?? "预演结果已生成。");
    } catch (caughtError) {
      if (controller.signal.aborted) return;
      setActionError(caughtError instanceof Error ? caughtError.message : "轮次预演失败。");
    } finally {
      if (previewRequest.current === controller) setPending(null);
    }
  }

  function exportCycleDetail() {
    if (!cycleDetail) return;
    const blob = new Blob([JSON.stringify(cycleDetail, null, 2)], {
      type: "application/json;charset=utf-8",
    });
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

  if (loading && !data) {
    return <div className={cx(adminStyles, "admin-empty-state")}>正在加载轮次中心…</div>;
  }

  const auditHref = selectedCycle
    ? `/admin/audit?${new URLSearchParams({ cycleId: selectedCycle.id, cycleName: selectedCycle.codename })}`
    : "/admin/audit";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>轮次中心</h1>
          <p>看报名进展，预演匹配，核对最终结果。</p>
        </div>
        <div className="auth-actions">
          <button
            className="ui-button ui-button--secondary"
            type="button"
            disabled={loading || !!pending}
            onClick={() => {
              void refresh();
              refreshSelectedCycleDataViews();
            }}
          >
            刷新
          </button>
        </div>
      </header>
      {error && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {error}
        </p>
      )}
      {actionError && !editorOpen && !deleteTarget && (
        <p role="alert" className="ui-form-message ui-form-message--error">
          {actionError}
        </p>
      )}
      {actionMessage && (
        <p role="status" className="ui-form-message ui-form-message--success">
          {actionMessage}
        </p>
      )}

      <WeeklyCycleSettings onSaved={() => { void refresh(); refreshSelectedCycleDataViews(); }} />

      <AdminDetailDialog open={!!deleteTarget} onClose={() => { if (!pending) setDeleteTarget(null); }} title="删除草稿轮次" headerLabel="轮次管理">
        <h2>删除草稿轮次</h2>
        <p>确认删除“{deleteTarget?.codename}”？将同时删除本轮的 {deleteTarget?.participationCount ?? 0} 条参与记录，删除后不可恢复。用户账号和问卷不受影响。</p>
        {actionError && <p role="alert" className="ui-form-message ui-form-message--error">{actionError}</p>}
        <div className="auth-actions">
          <button className="ui-button ui-button--secondary" type="button" disabled={!!pending} onClick={() => setDeleteTarget(null)}>取消</button>
          <button className="ui-button ui-button--primary" type="button" disabled={!!pending} onClick={() => void deleteCycle()}>{pending === "delete" ? "删除中…" : "确认删除"}</button>
        </div>
      </AdminDetailDialog>

      <section className={styles.panel} aria-labelledby="cycle-management-title">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="cycle-management-title">轮次管理</h2>
            <p>共 {data?.total ?? 0} 个轮次，选择一个查看图表和匹配结果。</p>
          </div>
          <div className="auth-actions">
            <button
              className="ui-button ui-button--primary"
              type="button"
              disabled={!!pending}
              onClick={() => {
                setSelectedCycleId(ADMIN_NEW_CYCLE_SELECTION);
                setCycleForm(createEmptyCycleForm());
                setEditorOpen(true);
                setActionError(null);
                setActionMessage(null);
              }}
            >
              新建轮次
            </button>
            <button
              className="ui-button ui-button--secondary"
              type="button"
              disabled={!selectedCycle || !!pending}
              onClick={() => {
                setEditorOpen(true);
                setActionError(null);
              }}
            >
              编辑轮次
            </button>
            <button className="ui-button ui-button--secondary" type="button"
              disabled={!selectedCycle || selectedCycle.status !== "DRAFT" || !!pending || detailLoading || !cycleDetail || cycleDetail.cycle.id !== selectedCycle.id || cycleDetail.summary.matchedPairCount > 0}
              onClick={() => { if (selectedCycle && cycleDetail) { setActionError(null); setDeleteTarget({ ...selectedCycle, participationCount: cycleDetail.summary.participationCount }); } }}>
              删除草稿
            </button>
          </div>
        </div>
        <p className={styles.scopeNote}>尚未生成匹配结果的草稿可删除，其参与记录会一并删除；进行中和已揭晓轮次保留历史记录。</p>
        <form className={cx(adminStyles, "admin-search-bar")} onSubmit={handleSearchSubmit}>
          <input
            value={draftSearch}
            onChange={(event) => setDraftSearch(event.target.value)}
            placeholder="搜索轮次名称或备注"
            aria-label="搜索轮次"
          />
        </form>
        <div className={cx(adminStyles, "admin-tabs")}>
          {(["ALL", "DRAFT", "OPEN", "PREPARING", "REVEAL_READY", "REVEALED"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? "ui-segmented-item active" : "ui-segmented-item"}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
            >
              {CYCLE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className={styles.cycleGrid}>
          {cycles.map((cycle) => (
            <button
              key={cycle.id}
              type="button"
              className={styles.cycleItem}
              aria-pressed={cycle.id === selectedCycleId}
              disabled={!!pending && pending !== "preview"}
              onClick={() => {
                setSelectedCycleId(cycle.id);
              }}
            >
              <div className={cx(adminStyles, "admin-record-topline")}>
                <strong>{cycle.codename}</strong>
                <span className="ui-badge ui-badge--neutral" style={STATUS_STYLES[cycle.status]}>
                  {CYCLE_STATUS_LABELS[cycle.status]}
                </span>
              </div>
              <p>揭晓：{formatChinaStandardDateTime(cycle.revealAt)}</p>
            </button>
          ))}
          {cycles.length === 0 && (
            <div className={cx(adminStyles, "admin-empty-state")}>没有找到匹配的轮次。</div>
          )}
        </div>
        {data && data.totalPages > 1 && (
          <AdminPagination
            className={cx(adminStyles, "admin-pagination")}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            unit="个轮次"
            onPageChange={setPage}
          />
        )}
      </section>

      {selectedCycle && (
        <>
          <section className={styles.cycleContext} aria-label="轮次信息">
            <div className={styles.schedule}>
              <strong>当前：{selectedCycle.codename}</strong>
              <span
                className="ui-badge ui-badge--neutral"
                style={STATUS_STYLES[selectedCycle.status]}
              >
                {CYCLE_STATUS_LABELS[selectedCycle.status]}
              </span>
              <span>
                报名截止 {formatChinaStandardDateTime(selectedCycle.participationDeadline)}
              </span>
              <span>揭晓 {formatChinaStandardDateTime(selectedCycle.revealAt)}</span>
            </div>
            <div className="auth-actions">
              <Link href={auditHref} className={styles.auditLink}>
                查看本轮审计 ↗
              </Link>
            </div>
          </section>

          <section
            className={styles.panel}
            aria-labelledby="cycle-participants-title"
            id="participants"
          >
            <div className={styles.sectionHead}>
              <div>
                <h2 id="cycle-participants-title">参与者与完成度</h2>
                <p>本轮报名、学校分布与问卷完成情况，一处查看。</p>
              </div>
            </div>
            <CycleStatistics
              key={selectedCycle.id}
              cycleId={selectedCycle.id}
              refreshKey={cycleDataRefreshKey}
              summary={cycleDetail?.cycle.id === selectedCycleId ? cycleDetail.summary : null}
            />
          </section>

          <section className={styles.panel} aria-labelledby="cycle-results-title">
            <div className={styles.sectionHead}>
              <div>
                <h2 id="cycle-results-title">匹配结果</h2>
                <p>预演用于检查建议组合，最终展示已生成的正式匹配。</p>
              </div>
            </div>
            <div className={styles.resultToolbar}>
              <div className={styles.resultTabs} role="tablist" aria-label="匹配结果类型">
                <button
                  id="preview-tab"
                  role="tab"
                  aria-selected={resultTab === "preview"}
                  aria-controls="preview-results"
                  type="button"
                  onClick={() => setResultTab("preview")}
                >
                  预演
                </button>
                <button
                  id="final-tab"
                  role="tab"
                  aria-selected={resultTab === "final"}
                  aria-controls="final-results"
                  type="button"
                  onClick={() => setResultTab("final")}
                >
                  最终
                </button>
              </div>
              {resultTab === "preview" ? (
                <button
                  className="ui-button ui-button--secondary"
                  type="button"
                  disabled={!!pending}
                  onClick={() => void previewCycle()}
                >
                  {pending === "preview" ? "预演中…" : cyclePreview ? "重新预演" : "生成预演"}
                </button>
              ) : (
                <div className="auth-actions">
                  <button
                    className="ui-button ui-button--primary"
                    type="button"
                    disabled={!!pending}
                    onClick={() => void runCycle(false)}
                  >
                    {pending === "run" ? "执行中…" : "正式执行"}
                  </button>
                  <button
                    className="ui-button ui-button--secondary"
                    type="button"
                    disabled={!!pending}
                    aria-describedby="force-run-description"
                    onClick={() => void runCycle(true)}
                  >
                    {pending === "force-run" ? "强制中…" : "强制重新执行"}
                  </button>
                </div>
              )}
            </div>
            {resultTab === "preview" ? (
              <div role="tabpanel" id="preview-results" aria-labelledby="preview-tab">
                {pending === "preview" ? (
                  <p className={styles.empty}>正在生成预演…</p>
                ) : (
                  <>
                    {cyclePreview?.cycleId === selectedCycleId ? (
                      (() => {
                        const allP = cyclePreview.suggestedPairs;
                        const pTotalPages = Math.max(1, Math.ceil(allP.length / PAGE_SIZE_PAIRS));
                        const pSafePage = Math.min(pairPage, pTotalPages);
                        const pStart = (pSafePage - 1) * PAGE_SIZE_PAIRS;
                        const visibleP = allP.slice(pStart, pStart + PAGE_SIZE_PAIRS);

                        return (
                          <div className={cx(adminStyles, "admin-page-stack")}>
                            <div className={styles.resultNote}>
                              <time dateTime={cyclePreview.generatedAt}>
                                生成于{" "}
                                {formatChinaStandardDateTime(cyclePreview.generatedAt, {
                                  dateStyle: "short",
                                  timeStyle: "medium",
                                })}
                                （北京时间）
                              </time>
                              <span>
                                建议 {allP.length} 组 · 未匹配{" "}
                                {cyclePreview.unmatchedUserIds.length} 人
                              </span>
                              <span>预演反映生成时的数据，最终结果以正式执行为准。</span>
                            </div>
                            <div className={cx(adminStyles, "admin-record-list")}>
                              {visibleP.map((pair) => (
                                <div
                                  key={`${pair.leftUserId}-${pair.rightUserId}`}
                                  className={cx(adminStyles, "admin-record-item")}
                                >
                                  <div className={cx(adminStyles, "admin-record-topline")}>
                                    <strong>
                                      {pair.leftDisplayName ?? pair.leftUserId} ×{" "}
                                      {pair.rightDisplayName ?? pair.rightUserId}
                                    </strong>
                                    <span className="ui-badge ui-badge--neutral">
                                      分数 {pair.score.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {allP.length === 0 && (
                                <div className={cx(adminStyles, "admin-empty-state")}>
                                  当前没有建议匹配。
                                </div>
                              )}
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
                      })()
                    ) : (
                      <div className={cx(adminStyles, "admin-empty-state")}>
                        点击「生成预演」查看建议组合，不会生成正式匹配。
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div role="tabpanel" id="final-results" aria-labelledby="final-tab">
                <p id="force-run-description" className={styles.finalNotice}>
                  强制重新执行会删除本轮已有匹配并重新生成。
                </p>
                {selectedCycle.status !== "REVEALED" && (
                  <p className={styles.finalNotice}>
                    正式匹配即使已生成，也将在轮次揭晓后向用户显示。
                  </p>
                )}
                {matchesLoading ? (
                  <div className={cx(adminStyles, "admin-empty-state")}>正在加载匹配结果...</div>
                ) : matchesData && matchesData.items.length > 0 ? (
                  <>
                    <div className={cx(adminStyles, "admin-record-list")}>
                      {matchesData.items.map((match) => {
                        const isExpanded = expandedMatchId === match.id;
                        const meetupFeedback = match.meetupFeedback ?? [];

                        return (
                          <div key={match.id} className={cx(adminStyles, "admin-record-item")}>
                            <div className={cx(adminStyles, "admin-record-topline")}>
                              <strong>
                                {match.participants
                                  .map((p) => p.user.displayName ?? p.user.email)
                                  .join(" × ")}
                              </strong>
                              <span className="ui-badge ui-badge--neutral">
                                分数 {match.score.toFixed(1)}
                              </span>
                            </div>
                            <div className={cx(adminStyles, "admin-inline-meta")}>
                              <span>
                                揭晓：
                                {match.revealedAt
                                  ? formatChinaStandardDateTime(match.revealedAt)
                                  : "待揭晓"}
                              </span>
                              <span>
                                引荐：
                                {match.introducedAt
                                  ? formatChinaStandardDateTime(match.introducedAt)
                                  : "未引荐"}
                              </span>
                              <span>举报数：{match.reports.length}</span>
                              <span>旧匹配反馈：{match.feedback.length}</span>
                              <span>会后反馈：{meetupFeedback.length}</span>
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
                              <div style={{ marginTop: "0.75rem" }}>
                                <h4>旧匹配反馈</h4>
                                {match.feedback.length > 0 ? (
                                  <ul className={cx(adminStyles, "admin-reason-list")}>
                                    {match.feedback.map((fb) => {
                                      const author = match.participants.find(
                                        (p) => p.userId === fb.authorUserId
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
                                  <p style={{ margin: "0.5rem 0 0" }}>暂无旧匹配反馈。</p>
                                )}
                                <h4 style={{ marginTop: "0.9rem" }}>会后反馈</h4>
                                {meetupFeedback.length > 0 ? (
                                  <ul className={cx(adminStyles, "admin-reason-list")}>
                                    {meetupFeedback.map((fb) => {
                                      const author = match.participants.find(
                                        (p) => p.userId === fb.authorUserId
                                      );
                                      const authorName =
                                        author?.user.displayName ??
                                        author?.user.email ??
                                        fb.authorUserId;
                                      const subject = match.participants.find(
                                        (p) => p.userId === fb.subjectUserId
                                      );
                                      const subjectName =
                                        subject?.user.displayName ??
                                        subject?.user.email ??
                                        fb.subjectUserId;
                                      const tags = [...fb.positiveTags, ...fb.issueTags];
                                      return (
                                        <li key={fb.id}>
                                          {authorName} → {subjectName}：契合 {fb.personalFitScore}
                                          /5， 互动 {fb.interactionQualityScore}/5， 边界{" "}
                                          {fb.safetyBoundaryLevel}
                                          {tags.length > 0 ? `；标签：${tags.join("、")}` : ""}
                                          {fb.note ? `；说明：${fb.note}` : ""}
                                          ；创建 {formatChinaStandardDateTime(fb.createdAt)}
                                          ；更新 {formatChinaStandardDateTime(fb.updatedAt)}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <p style={{ margin: "0.5rem 0 0" }}>暂无会后反馈。</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
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
                  <div className={cx(adminStyles, "admin-empty-state")}>
                    当前轮次还没有生成匹配。
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}
      {!selectedCycle && (
        <div className={styles.empty}>选择一个轮次查看数据，或新建下一轮匹配。</div>
      )}

      <AdminDetailDialog
        open={editorOpen}
        title={cycleForm.cycleId ? "编辑轮次" : "新建轮次"}
        headerLabel="轮次管理"
        onClose={() => {
          setEditorOpen(false);
          if (selectedCycleId === ADMIN_NEW_CYCLE_SELECTION)
            setSelectedCycleId(cycles[0]?.id ?? null);
        }}
      >
        <div className={styles.editor}>
          <h2>{cycleForm.cycleId ? "编辑轮次" : "新建轮次"}</h2>
          {actionError && editorOpen && (
            <p role="alert" className="ui-form-message ui-form-message--error">
              {actionError}
            </p>
          )}
          <form className="auth-stack" onSubmit={saveCycle}>
            <label>
              <span>轮次代号</span>
              <input
                required
                value={cycleForm.codename}
                onChange={(e) => setCycleForm((f) => ({ ...f, codename: e.target.value }))}
              />
            </label>
            <div className={cx(adminStyles, "admin-form-grid")}>
              <label>
                <span>参与截止（北京时间）</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.participationDeadline}
                  onChange={(e) =>
                    setCycleForm((f) => ({
                      ...f,
                      participationDeadline: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>揭晓时间（北京时间）</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.revealAt}
                  onChange={(e) => setCycleForm((f) => ({ ...f, revealAt: e.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>状态</span>
              <select
                value={cycleForm.status}
                disabled={isSystemLockedCycleStatus}
                onChange={(e) =>
                  setCycleForm((f) => ({
                    ...f,
                    status: e.target.value as AdminCycle["status"],
                  }))
                }
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
              <textarea
                rows={4}
                value={cycleForm.notes}
                onChange={(e) => setCycleForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <button
              className="ui-button ui-button--primary"
              type="submit"
              disabled={pending === "save"}
            >
              {pending === "save" ? "保存中..." : cycleForm.cycleId ? "保存轮次" : "创建轮次"}
            </button>
          </form>
          {selectedCycle && (
            <div className={styles.editorTools}>
              <button
                className="ui-button ui-button--secondary"
                type="button"
                disabled={!!pending}
                onClick={() => void duplicateCycle()}
              >
                {pending === "duplicate" ? "复制中…" : "复制为草稿"}
              </button>
              <button
                className="ui-button ui-button--secondary"
                type="button"
                disabled={!cycleDetail || detailLoading}
                onClick={exportCycleDetail}
              >
                导出详情
              </button>
            </div>
          )}
        </div>
      </AdminDetailDialog>
    </div>
  );
}
