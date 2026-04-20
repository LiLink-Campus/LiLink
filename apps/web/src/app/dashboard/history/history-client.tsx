"use client";

import type { AuthMePayload } from "../../../lib/api";
import { ReportForm } from "../_components/ReportForm";
import { SubPageNav } from "../_components/SubPageNav";
import { useMatchActions } from "../_components/useMatchActions";
import {
  REPORT_FORM_SECTION_ID,
  formatCycleRevealAt,
  limitedHistoryExplanation,
  normalizeConversationTopics,
  normalizeMatchReasons,
  reportHandlingChipLabel,
} from "../_lib/format";
import type {
  DashboardHistoryItem,
  DashboardPayload,
} from "../_lib/types";

export function HistoryClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  const {
    dashboard,
    error,
    savedMessage,
    saving,
    requestContact,
    submitReport,
    reportOpen,
    reportTargetMatchId,
    reportReason,
    reportDetails,
    reportSectionRef,
    reportReasonSelectRef,
    setReportReason,
    setReportDetails,
    closeReportForm,
    toggleReportForm,
    reportFormIsOpenForMatch,
  } = useMatchActions({
    initialDashboard,
    currentUserId: initialUser?.id ?? null,
  });

  const recentMatchHistory: DashboardHistoryItem[] =
    dashboard?.recentMatchHistory ?? [];

  return (
    <main className="page-shell dashboard-page">
      <SubPageNav />

      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">最近轮次</p>
        <h1>最近三次匹配记录</h1>
        <p className="dashboard-lede">
          按揭晓时间从新到旧排列。仅当该轮为「已匹配且完整可见」时，可在卡片内使用联络或举报。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      {recentMatchHistory.length === 0 ? (
        <section className="content-panel dashboard-panel-wide">
          <p className="dashboard-muted" style={{ margin: 0 }}>
            暂无历史记录。等你参与并经过几轮揭晓后，这里会出现最近的几次匹配。
          </p>
        </section>
      ) : (
        <section className="content-panel dashboard-panel-wide">
          <ul className="dashboard-history-list">
            {recentMatchHistory.map((item) => {
              const participationLabel =
                item.participationStatus === "OPTED_IN" ? "已参加" : "未参加";

              return (
                <li key={item.cycleId} className="dashboard-history-card">
                  <div className="dashboard-history-card-head">
                    <h3 className="dashboard-history-title">{item.codename}</h3>
                    <p className="dashboard-muted dashboard-history-meta">
                      {formatCycleRevealAt(item.revealAt)} ·{" "}
                      {participationLabel}
                    </p>
                  </div>
                  {item.result === "NOT_PARTICIPATED" ? (
                    <p
                      className="dashboard-muted"
                      style={{ margin: "0.35rem 0 0" }}
                    >
                      该轮你未报名参加。
                    </p>
                  ) : null}
                  {item.result === "UNMATCHED" ? (
                    <p
                      className="dashboard-muted"
                      style={{ margin: "0.35rem 0 0" }}
                    >
                      你参加了该轮，但未匹配到对象。
                    </p>
                  ) : null}
                  {item.result === "MATCHED" &&
                  item.visibility === "LIMITED" ? (
                    <p
                      className="dashboard-muted"
                      style={{ margin: "0.35rem 0 0" }}
                    >
                      {limitedHistoryExplanation(item.limitedReason)}
                    </p>
                  ) : null}
                  {item.result === "MATCHED" &&
                  item.visibility === "VISIBLE" &&
                  item.match ? (
                    <div className="dashboard-history-match-body">
                      {(() => {
                        const hm = item.match;
                        const counterpartHistory =
                          hm.participants.find(
                            (p) => p.userId !== initialUser.id,
                          ) ?? null;
                        const introducedRow = Boolean(hm.introducedAt);
                        const rowReasons = normalizeMatchReasons(hm.reasons);
                        const rowReason = hm.reason?.trim() ?? "";
                        const rowConversationTopics =
                          normalizeConversationTopics(hm.conversationTopics);
                        return (
                          <>
                            <p
                              className="dashboard-match-score"
                              style={{ marginTop: "0.5rem" }}
                            >
                              匹配度：<strong>{hm.score.toFixed(1)}</strong> /
                              100
                            </p>
                            {!introducedRow ? (
                              <p className="dashboard-muted">
                                未引荐前不展示对方学校、昵称等可识别信息。
                              </p>
                            ) : null}
                            {introducedRow && counterpartHistory?.email ? (
                              <p className="form-success dashboard-match-email">
                                联络邮箱：{counterpartHistory.email}
                              </p>
                            ) : null}
                            {introducedRow && counterpartHistory?.introLine ? (
                              <p className="dashboard-muted dashboard-match-intro">
                                对方介绍：{counterpartHistory.introLine}
                              </p>
                            ) : null}
                            {rowReason ? (
                              <p
                                className="dashboard-muted"
                                style={{ marginTop: "0.5rem" }}
                              >
                                {rowReason}
                              </p>
                            ) : rowReasons.length > 0 ? (
                              <ul
                                className="reason-list"
                                style={{ marginTop: "0.5rem" }}
                              >
                                {rowReasons.map((reason, ri) => (
                                  <li
                                    key={`${item.cycleId}-${ri}-${reason.slice(
                                      0,
                                      32,
                                    )}`}
                                  >
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            {rowConversationTopics.length > 0 ? (
                              <>
                                <p
                                  className="eyebrow"
                                  style={{
                                    marginTop: "0.85rem",
                                    marginBottom: "0.35rem",
                                  }}
                                >
                                  聊天话题
                                </p>
                                <ul
                                  className="reason-list"
                                  style={{ marginTop: 0 }}
                                >
                                  {rowConversationTopics.map((topic, topicIndex) => (
                                    <li
                                      key={`${item.cycleId}-${topicIndex}-${topic.slice(
                                        0,
                                        32,
                                      )}`}
                                    >
                                      {topic}
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                            <div
                              className="auth-actions"
                              style={{ marginTop: "0.75rem" }}
                            >
                              {introducedRow ? (
                                <span className="domain-chip">已引荐</span>
                              ) : (
                                <button
                                  className="button-primary"
                                  disabled={saving === "contact"}
                                  type="button"
                                  onClick={() => void requestContact(hm.id)}
                                >
                                  {saving === "contact"
                                    ? "发送中…"
                                    : "双方引荐联系"}
                                </button>
                              )}
                              {(() => {
                                const label = reportHandlingChipLabel(
                                  hm.reportStatus,
                                );
                                return label ? (
                                  <span className="domain-chip">{label}</span>
                                ) : (
                                  <button
                                    className="button-secondary"
                                    aria-controls={REPORT_FORM_SECTION_ID}
                                    aria-expanded={reportFormIsOpenForMatch(hm.id)}
                                    disabled={saving === "report"}
                                    type="button"
                                    onClick={() => toggleReportForm(hm.id)}
                                  >
                                    举报
                                  </button>
                                );
                              })()}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {reportOpen && reportTargetMatchId ? (
        <ReportForm
          ref={reportSectionRef}
          reasonSelectRef={reportReasonSelectRef}
          reason={reportReason}
          details={reportDetails}
          saving={saving === "report"}
          onReasonChange={setReportReason}
          onDetailsChange={setReportDetails}
          onSubmit={() => void submitReport()}
          onCancel={closeReportForm}
        />
      ) : null}
    </main>
  );
}
