"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { useAdminCollection } from "../use-admin-collection";
import { useAdminSearch } from "../use-admin-search";
import type { AdminReport, AdminReportContext } from "../types";

type ReportFilter = "ALL" | AdminReport["status"];

const REPORT_STATUS_LABELS: Record<ReportFilter, string> = {
  ALL: "全部",
  OPEN: "待处理",
  RESOLVED: "已结案",
  DISMISSED: "已驳回",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminReportsPage() {
  const [filter, setFilter] = useState<ReportFilter>("OPEN");
  const [page, setPage] = useState(1);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [reportContext, setReportContext] = useState<AdminReportContext | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { draftSearch, submittedSearch, setDraftSearch, submitSearch } = useAdminSearch();
  const { data, loading, error, refresh } = useAdminCollection<AdminReport>(
    "/admin/reports",
    {
      page,
      pageSize: 10,
      search: submittedSearch.trim(),
      status: filter === "ALL" ? undefined : filter,
    },
  );
  const reports = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (!reports.length) {
      setSelectedReportId(null);
      return;
    }

    if (!selectedReportId || !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;

  useEffect(() => {
    setSelectedReportIds((current) =>
      current.filter((reportId) => reports.some((report) => report.id === reportId)),
    );
  }, [reports]);

  useEffect(() => {
    if (!selectedReportId) {
      setReportContext(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    fetchApi<AdminReportContext>(`/admin/reports/${selectedReportId}`)
      .then((context) => {
        if (!active) {
          return;
        }

        setReportContext(context);
      })
      .catch((caughtError) => {
        if (!active) {
          return;
        }

        setActionError(
          caughtError instanceof Error ? caughtError.message : "举报详情加载失败。",
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
  }, [selectedReportId]);

  async function reviewReport(
    reportId: string,
    status: AdminReport["status"],
    suspendUser: boolean,
  ) {
    setPending(status);
    setActionError(null);

    try {
      await fetchApi(`/admin/reports/${reportId}`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          notes: notes[reportId] ?? selectedReport?.adminNotes ?? "",
          suspendUser,
        }),
      });
      await refresh();
      const context = await fetchApi<AdminReportContext>(`/admin/reports/${reportId}`);
      setReportContext(context);
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "举报处理失败。",
      );
    } finally {
      setPending(null);
    }
  }

  async function batchReviewReports(
    status: AdminReport["status"],
    suspendUsers: boolean,
  ) {
    if (selectedReportIds.length === 0) {
      return;
    }

    setPending(`batch-${status}`);
    setActionError(null);

    try {
      await fetchApi("/admin/reports/batch-review", {
        method: "POST",
        body: JSON.stringify({
          reportIds: selectedReportIds,
          status,
          notes: "",
          suspendUsers,
        }),
      });
      setSelectedReportIds([]);
      await refresh();
      if (selectedReportId) {
        const context = await fetchApi<AdminReportContext>(`/admin/reports/${selectedReportId}`);
        setReportContext(context);
      }
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error ? caughtError.message : "批量处理失败。",
      );
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
    return <div className="admin-empty-state">正在加载举报中心...</div>;
  }

  return (
    <div className="admin-page admin-page-stack" style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div className="admin-page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>举报中心</h1>
          <p style={{ color: "var(--fg-secondary)", fontSize: "1.05rem" }}>把举报当作审核工单处理，而不是简单列表。先过滤队列，再进入详情判断。</p>
        </div>
        <button className="button-secondary" onClick={() => void refresh()} type="button" style={{ minHeight: "2.8rem", padding: "0 1.5rem" }}>
          刷新
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {actionError ? <p className="form-error">{actionError}</p> : null}

      <section className="admin-workspace-grid">
        <article className="content-panel admin-list-panel">
          <div className="admin-section-header">
            <div>
              <p className="eyebrow">举报</p>
              <h2>举报列表</h2>
            </div>
          </div>
          <form className="admin-search-bar" onSubmit={handleSearchSubmit}>
            <input
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="搜索原因、详情、举报人或被举报人邮箱"
            />
          </form>

          <div className="admin-tabs">
            {(["ALL", "OPEN", "RESOLVED", "DISMISSED"] as const).map((status) => (
              <button
                key={status}
                type="button"
                className={filter === status ? "admin-tab active" : "admin-tab"}
                onClick={() => {
                  setFilter(status);
                  setPage(1);
                }}
              >
                {REPORT_STATUS_LABELS[status]}
              </button>
            ))}
          </div>

          <div className="admin-batch-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                setSelectedReportIds((current) =>
                  current.length === reports.length ? [] : reports.map((report) => report.id),
                )
              }
            >
              {selectedReportIds.length === reports.length && reports.length > 0
                ? "取消全选"
                : "全选当前列表"}
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={selectedReportIds.length === 0 || pending === "batch-RESOLVED"}
              onClick={() => void batchReviewReports("RESOLVED", false)}
            >
              批量结案
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={selectedReportIds.length === 0 || pending === "batch-DISMISSED"}
              onClick={() => void batchReviewReports("DISMISSED", false)}
            >
              批量驳回
            </button>
            <button
              type="button"
              className="button-ghost"
              disabled={selectedReportIds.length === 0 || pending === "batch-RESOLVED"}
              onClick={() => void batchReviewReports("RESOLVED", true)}
            >
              批量封禁并结案
            </button>
          </div>

          <div className="admin-record-list">
            {reports.map((report) => (
              <div
                key={report.id}
                className={
                  report.id === selectedReportId
                    ? "admin-record-item admin-record-item-active"
                    : "admin-record-item"
                }
              >
                <div className="admin-record-selection">
                  <input
                    type="checkbox"
                    checked={selectedReportIds.includes(report.id)}
                    onChange={(event) =>
                      setSelectedReportIds((current) =>
                        event.target.checked
                          ? [...current, report.id]
                          : current.filter((item) => item !== report.id),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="admin-record-button"
                    onClick={() => setSelectedReportId(report.id)}
                  >
                    <div className="admin-record-topline">
                      <strong>{report.reason}</strong>
                      <span className="domain-chip">
                        {REPORT_STATUS_LABELS[report.status]}
                      </span>
                    </div>
                    <p>{report.reporter.displayName ?? report.reporter.email} {" → "} {report.reportedUser.displayName ?? report.reportedUser.email}</p>
                    <div className="admin-inline-meta">
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>{report.createdBlock ? "已自动互相拉黑" : "未自动拉黑"}</span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
            {reports.length === 0 ? (
              <div className="admin-empty-state">当前筛选条件下没有举报。</div>
            ) : null}
          </div>
          {data ? (
            <div className="admin-pagination">
              <button disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} type="button">
                上一页
              </button>
              <span>
                {data.page} / {data.totalPages} · 共 {data.total} 条举报
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
          {selectedReport && reportContext ? (
            <div className="admin-page-stack">
              <div className="admin-section-header">
                <div>
                  <p className="eyebrow">处理详情</p>
                  <h2>{selectedReport.reason}</h2>
                  <p>创建于 {formatDateTime(selectedReport.createdAt)}</p>
                </div>
                <span className="domain-chip">
                  {REPORT_STATUS_LABELS[selectedReport.status]}
                </span>
              </div>

              <div className="admin-detail-grid">
                <div>
                  <h3>举报人</h3>
                  <p>{reportContext.report.reporter.displayName ?? reportContext.report.reporter.email}</p>
                  <p>{reportContext.report.reporter.school?.name ?? "未识别学校"}</p>
                  <p>账号状态：{reportContext.report.reporter.status}</p>
                </div>
                <div>
                  <h3>被举报人</h3>
                  <p>{reportContext.report.reportedUser.displayName ?? reportContext.report.reportedUser.email}</p>
                  <p>{reportContext.report.reportedUser.school?.name ?? "未识别学校"}</p>
                  <p>账号状态：{reportContext.report.reportedUser.status}</p>
                </div>
              </div>

              <div className="admin-review-box">
                <h3>举报内容</h3>
                <p>{selectedReport.details ?? "无补充说明。"}</p>
                <p>关联 match：{selectedReport.matchId ?? "无"}</p>
                <p>管理员备注：{selectedReport.adminNotes ?? "暂无"}</p>
                <p>处理时间：{selectedReport.handledAt ? formatDateTime(selectedReport.handledAt) : "未处理"}</p>
              </div>

              <div className="admin-detail-grid">
                <div className="admin-review-box">
                  <h3>风险画像</h3>
                  <p>收到举报：{reportContext.riskProfile.receivedReportCount}</p>
                  <p>发起举报：{reportContext.riskProfile.filedReportCount}</p>
                  <p>未结工单：{reportContext.riskProfile.openReportCount}</p>
                  <p>已结工单：{reportContext.riskProfile.resolvedReportCount}</p>
                  <p>互相拉黑记录：{reportContext.riskProfile.mutualBlocks.length}</p>
                </div>
                <div className="admin-review-box">
                  <h3>关联 Match 视角</h3>
                  {reportContext.report.match ? (
                    <>
                      <p>参与者：{reportContext.report.match.participants.map((participant) => participant.user.displayName ?? participant.user.email).join(" × ")}</p>
                      <p>当前 match 举报数：{reportContext.report.match.reports.length}</p>
                      <p>引荐状态：{reportContext.report.match.introducedAt ? formatDateTime(reportContext.report.match.introducedAt) : "未引荐"}</p>
                    </>
                  ) : (
                    <p>该举报没有关联到具体 match。</p>
                  )}
                </div>
              </div>

              <label>
                <span>处理备注</span>
                <textarea
                  rows={4}
                  value={notes[selectedReport.id] ?? selectedReport.adminNotes ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [selectedReport.id]: event.target.value }))
                  }
                />
              </label>

              <div className="auth-actions">
                <button
                  className="button-primary"
                  type="button"
                  disabled={pending === "RESOLVED"}
                  onClick={() => void reviewReport(selectedReport.id, "RESOLVED", false)}
                >
                  处理完成
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={pending === "DISMISSED"}
                  onClick={() => void reviewReport(selectedReport.id, "DISMISSED", false)}
                >
                  驳回举报
                </button>
                <button
                  className="button-ghost"
                  type="button"
                  disabled={pending === "OPEN"}
                  onClick={() => void reviewReport(selectedReport.id, "OPEN", false)}
                >
                  重新打开
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  disabled={pending === "RESOLVED"}
                  onClick={() => void reviewReport(selectedReport.id, "RESOLVED", true)}
                >
                  封禁并结案
                </button>
              </div>

              <div className="admin-detail-grid">
                <div>
                  <h3>该用户最近收到的举报</h3>
                  <div className="admin-record-list">
                    {reportContext.report.reportedUser.reportsReceived.map((report) => (
                      <div key={report.id} className="admin-record-item">
                        <div className="admin-record-topline">
                          <strong>{report.reason}</strong>
                          <span className="domain-chip">
                            {REPORT_STATUS_LABELS[report.status]}
                          </span>
                        </div>
                        <p>{formatDateTime(report.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>处理记录</h3>
                  <div className="admin-record-list">
                    {reportContext.logs.map((log) => (
                      <div key={log.id} className="admin-record-item">
                        <div className="admin-record-topline">
                          <strong>{log.action}</strong>
                          <span className="domain-chip">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p>{JSON.stringify(log.metadata ?? {})}</p>
                      </div>
                    ))}
                    {reportContext.logs.length === 0 ? (
                      <div className="admin-empty-state">还没有处理日志。</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="admin-empty-state">正在加载举报详情...</div>
          ) : (
            <div className="admin-empty-state">左侧选择举报后可查看详情。</div>
          )}
        </article>
      </section>
    </div>
  );
}
