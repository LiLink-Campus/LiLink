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
  }, [selectedCycle]);

  useEffect(() => {
    if (!selectedCycleId) {
      setCycleDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    fetchApi<AdminCycleDetail>(`/admin/cycles/${selectedCycleId}`)
      .then((detail) => {
        if (!active) {
          return;
        }
        setCycleDetail(detail);
        setCyclePreview(null);
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }
        setActionError(
          caughtError instanceof Error ? caughtError.message : "轮次详情加载失败。",
        );
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedCycleId]);

  async function saveCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setActionError(null);
    setActionMessage(null);

    try {
      await fetchApi("/admin/cycles", {
        method: "PUT",
        body: JSON.stringify({
          ...cycleForm,
          cycleId: cycleForm.cycleId || undefined,
        }),
      });
      setActionMessage(cycleForm.cycleId ? "轮次已更新。" : "轮次已创建。");
      await refresh();
      if (cycleForm.cycleId) {
        const detail = await fetchApi<AdminCycleDetail>(`/admin/cycles/${cycleForm.cycleId}`);
        setCycleDetail(detail);
      }
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "轮次保存失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function runCycle(force: boolean) {
    if (!selectedCycleId) {
      return;
    }

    const confirmed = window.confirm(
      force
        ? "强制执行会跳过揭晓时间检查，并立即写入匹配结果。确认继续吗？"
        : "执行轮次会开始生成正式匹配结果。确认继续吗？",
    );

    if (!confirmed) {
      return;
    }

    setPending(force ? "force-run" : "run");
    setActionError(null);
    setActionMessage(null);

    try {
      const result = await fetchApi<{ ok: boolean; message?: string; createdMatches?: number }>(
        "/admin/cycles/run",
        {
          method: "POST",
          body: JSON.stringify({
            cycleId: selectedCycleId,
            force,
          }),
        },
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
      setActionError(
        caughtError instanceof Error ? caughtError.message : "轮次执行失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function duplicateCycle() {
    if (!selectedCycleId) {
      return;
    }

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
      setActionError(
        caughtError instanceof Error ? caughtError.message : "轮次复制失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function previewCycle() {
    if (!selectedCycleId) {
      return;
    }

    setPending("preview");
    setActionError(null);
    setActionMessage(null);

    try {
      const preview = await fetchApi<AdminCyclePreview>(`/admin/cycles/${selectedCycleId}/preview`);
      setCyclePreview(preview);
      setActionMessage(preview.message ?? "预演结果已生成。");
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "轮次预演失败。",
      );
    } finally {
      setPending(null);
    }
  }

  function exportCycleDetail() {
    if (!cycleDetail) {
      return;
    }

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

  if (loading) {
    return <div className="admin-empty-state">正在加载轮次中心...</div>;
  }

  return (
    <div className="admin-page admin-page-stack" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>轮次中心</h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>在同一页面管理轮次列表、编辑详情、执行轮次和查看阶段状态。</p>
        </div>
        <div className="auth-actions">
          <button
            className="button-secondary"
            onClick={() => {
              setSelectedCycleId(null);
              setCycleForm(createEmptyCycleForm());
              setActionMessage(null);
              setActionError(null);
            }}
            type="button"
            style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}
          >
            新建轮次
          </button>
          <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}>
            刷新
          </button>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}
      {actionMessage ? <p className="form-success">{actionMessage}</p> : null}

      <section className="admin-workspace-grid">
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
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="搜索 codename、状态或备注"
            />
          </div>
          <div className="admin-tabs">
            {(["ALL", "DRAFT", "OPEN", "REVEAL_READY", "REVEALED"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? "admin-tab active" : "admin-tab"}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
              >
                {CYCLE_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <div className="admin-record-list">
            {cycles.map((cycle) => (
              <button
                key={cycle.id}
                type="button"
                className={
                  cycle.id === selectedCycleId
                    ? "admin-record-item admin-record-item-active"
                    : "admin-record-item"
                }
                onClick={() => setSelectedCycleId(cycle.id)}
              >
                <div className="admin-record-topline">
                  <strong>{cycle.codename}</strong>
                  <span className="domain-chip" style={STATUS_STYLES[cycle.status]}>
                    {CYCLE_STATUS_LABELS[cycle.status]}
                  </span>
                </div>
                <p>揭晓：{formatDateTime(cycle.revealAt)}</p>
                <div className="admin-inline-meta">
                  <span>参与记录 {cycle._count.participations}</span>
                  <span>匹配数 {cycle._count.matches}</span>
                </div>
              </button>
            ))}
            {cycles.length === 0 ? (
              <div className="admin-empty-state">没有找到匹配的轮次。</div>
            ) : null}
          </div>
          {data ? (
            <div className="admin-pagination">
              <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
                上一页
              </button>
              <span>
                {data.page} / {data.totalPages} · 共 {data.total} 个轮次
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
        </article>

        <article className="content-panel admin-detail-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">轮次编辑</p>
              <h2>{cycleForm.cycleId ? "编辑轮次" : "新建轮次"}</h2>
            </div>
            <div className="auth-actions">
              <button
                className="button-secondary"
                type="button"
                disabled={!selectedCycleId || pending === "duplicate"}
                onClick={() => void duplicateCycle()}
              >
                {pending === "duplicate" ? "复制中..." : "复制为草稿"}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={!selectedCycleId || pending === "preview"}
                onClick={() => void previewCycle()}
              >
                {pending === "preview" ? "预演中..." : "预演匹配"}
              </button>
              <button
                className="button-secondary"
                type="button"
                disabled={!selectedCycleId || pending === "run"}
                onClick={() => void runCycle(false)}
              >
                {pending === "run" ? "执行中..." : "正常执行"}
              </button>
              <button
                className="button-ghost"
                type="button"
                disabled={!selectedCycleId || pending === "force-run"}
                onClick={() => void runCycle(true)}
              >
                {pending === "force-run" ? "强制执行中..." : "强制执行"}
              </button>
              <button
                className="button-ghost"
                type="button"
                disabled={!cycleDetail}
                onClick={exportCycleDetail}
              >
                导出详情
              </button>
            </div>
          </div>

          {selectedCycle ? (
            <div className="admin-inline-metrics">
                <div>
                  <span>状态</span>
                  <strong>{CYCLE_STATUS_LABELS[selectedCycle.status]}</strong>
                </div>
              <div>
                <span>参与记录</span>
                <strong>{selectedCycle._count.participations}</strong>
              </div>
              <div>
                <span>匹配数</span>
                <strong>{selectedCycle._count.matches}</strong>
              </div>
            </div>
          ) : null}

          <form className="auth-form" onSubmit={saveCycle}>
            <label>
              <span>轮次代号</span>
              <input
                required
                value={cycleForm.codename}
                onChange={(event) =>
                  setCycleForm((current) => ({ ...current, codename: event.target.value }))
                }
              />
            </label>
            <div className="form-grid">
              <label>
                <span>参与截止</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.participationDeadline}
                  onChange={(event) =>
                    setCycleForm((current) => ({
                      ...current,
                      participationDeadline: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>揭晓时间</span>
                <input
                  required
                  type="datetime-local"
                  value={cycleForm.revealAt}
                  onChange={(event) =>
                    setCycleForm((current) => ({ ...current, revealAt: event.target.value }))
                  }
                />
              </label>
            </div>
            <label>
              <span>状态</span>
              <select
                value={cycleForm.status}
                onChange={(event) =>
                  setCycleForm((current) => ({
                    ...current,
                    status: event.target.value as AdminCycle["status"],
                  }))
                }
              >
                <option value="DRAFT">草稿</option>
                <option value="OPEN">开放报名</option>
                <option value="REVEAL_READY">待揭晓</option>
                <option value="REVEALED">已揭晓</option>
              </select>
            </label>
            <label>
              <span>备注</span>
              <textarea
                rows={4}
                value={cycleForm.notes}
                onChange={(event) =>
                  setCycleForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </label>
            <button className="button-primary" type="submit" disabled={pending === "save"}>
              {pending === "save" ? "保存中..." : cycleForm.cycleId ? "保存轮次" : "创建轮次"}
            </button>
          </form>
        </article>
      </section>

      <section className="admin-dashboard-grid">
        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">参与者</p>
              <h2>参与者与完成度</h2>
            </div>
          </div>

          {detailLoading ? (
            <div className="admin-empty-state">正在加载轮次详情...</div>
          ) : cycleDetail ? (
            <div className="admin-record-list">
              {cycleDetail.cycle.participations.map((participation) => (
                <div key={participation.id} className="admin-record-item">
                  <div className="admin-record-topline">
                    <strong>{participation.user.displayName ?? participation.user.email}</strong>
                    <span className="domain-chip">
                      {PARTICIPATION_STATUS_LABELS[participation.status]}
                    </span>
                  </div>
                  <p>{participation.user.school?.name ?? "未识别学校"}</p>
                  <div className="admin-inline-meta">
                    <span>
                      问卷：{participation.user.questionnaireResponse?.submittedAt ? "已提交" : "未提交"}
                    </span>
                    <span>
                      加入时间：
                      {participation.optedInAt ? formatDateTime(participation.optedInAt) : "—"}
                    </span>
                  </div>
                </div>
              ))}
              {cycleDetail.cycle.participations.length === 0 ? (
                <div className="admin-empty-state">当前轮次还没有参与者。</div>
              ) : null}
            </div>
          ) : (
            <div className="admin-empty-state">选择轮次后查看参与者列表。</div>
          )}
        </article>

        <article className="content-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">匹配结果</p>
              <h2>匹配结果与执行记录</h2>
            </div>
          </div>

          {detailLoading ? (
            <div className="admin-empty-state">正在加载匹配结果...</div>
          ) : cycleDetail ? (
            <div className="admin-page-stack">
              <div className="admin-inline-metrics">
                <div>
                  <span>参与人数</span>
                  <strong>{cycleDetail.summary.participationCount}</strong>
                </div>
                <div>
                  <span>已 opt-in</span>
                  <strong>{cycleDetail.summary.optedInCount}</strong>
                </div>
                <div>
                  <span>匹配对数</span>
                  <strong>{cycleDetail.summary.matchedPairCount}</strong>
                </div>
                <div>
                  <span>待联系</span>
                  <strong>{cycleDetail.summary.pendingContactCount}</strong>
                </div>
              </div>

              <div className="admin-record-list">
                {cycleDetail.cycle.matches.map((match) => (
                  <div key={match.id} className="admin-record-item">
                    <div className="admin-record-topline">
                      <strong>
                        {match.participants.map((participant) => participant.user.displayName ?? participant.user.email).join(" × ")}
                      </strong>
                      <span className="domain-chip">分数 {match.score.toFixed(1)}</span>
                    </div>
                    <div className="admin-inline-meta">
                      <span>引荐：{match.introducedAt ? formatDateTime(match.introducedAt) : "未引荐"}</span>
                      <span>举报数：{match.reports.length}</span>
                    </div>
                    <ul className="admin-reason-list">
                      {match.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                {cycleDetail.cycle.matches.length === 0 ? (
                  <div className="admin-empty-state">当前轮次还没有生成匹配。</div>
                ) : null}
              </div>

              <div>
                <h3>运行记录</h3>
                <div className="admin-record-list">
                  {cycleDetail.logs.map((log) => (
                    <div key={log.id} className="admin-record-item">
                      <div className="admin-record-topline">
                        <strong>{log.action}</strong>
                        <span className="domain-chip">{formatDateTime(log.createdAt)}</span>
                      </div>
                      <p>{JSON.stringify(log.metadata ?? {})}</p>
                    </div>
                  ))}
                  {cycleDetail.logs.length === 0 ? (
                    <div className="admin-empty-state">当前轮次还没有运行日志。</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">选择轮次后查看匹配结果。</div>
          )}
        </article>
      </section>

      <section className="content-panel">
        <div className="admin-section-header">
            <div>
            <p className="eyebrow">预演</p>
            <h2>预演匹配</h2>
          </div>
        </div>

        {cyclePreview ? (
          <div className="admin-page-stack">
            <div className="admin-inline-metrics">
              <div>
                <span>候选组合</span>
                <strong>
                  {cyclePreview.totalCandidateCount ?? cyclePreview.candidates.length}
                </strong>
              </div>
              <div>
                <span>建议匹配</span>
                <strong>{cyclePreview.suggestedPairs.length}</strong>
              </div>
              <div>
                <span>未匹配用户</span>
                <strong>{cyclePreview.unmatchedUserIds.length}</strong>
              </div>
            </div>

            <div className="admin-record-list">
              {cyclePreview.suggestedPairs.map((pair) => (
                <div key={`${pair.leftUserId}-${pair.rightUserId}`} className="admin-record-item">
                  <div className="admin-record-topline">
                    <strong>
                      {pair.leftDisplayName ?? pair.leftUserId}
                      {" × "}
                      {pair.rightDisplayName ?? pair.rightUserId}
                    </strong>
                    <span className="domain-chip">分数 {pair.score.toFixed(1)}</span>
                  </div>
                  <ul className="admin-reason-list">
                    {pair.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {cyclePreview.suggestedPairs.length === 0 ? (
                <div className="admin-empty-state">当前没有建议匹配。</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="admin-empty-state">先选择轮次，再点击“预演匹配”。</div>
        )}
      </section>
    </div>
  );
}
