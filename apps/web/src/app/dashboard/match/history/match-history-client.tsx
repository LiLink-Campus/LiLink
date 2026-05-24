"use client";

import { dcx } from "../../_lib/dashboard-class-names";
import Link from "next/link";
import type { AuthMePayload } from "../../../../lib/api";
import { useDashboardSessionSeed } from "../../_components/DashboardSessionSeed";
import { FeedbackForm } from "../../_components/FeedbackForm";
import { MatchHistoryList } from "../../_components/MatchHistoryList";
import { ReportForm } from "../../_components/ReportForm";
import { useMatchActions } from "../../_components/useMatchActions";
import type { DashboardPayload } from "../../_lib/types";

export function MatchHistoryClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  useDashboardSessionSeed(initialUser);

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
    setReportReason,
    setReportDetails,
    closeReportForm,
    toggleReportForm,
    reportFormIsOpenForMatch,
    feedbackOpen,
    feedbackTargetMatchId,
    feedbackRating,
    feedbackComment,
    setFeedbackRating,
    setFeedbackComment,
    closeFeedbackForm,
    toggleFeedbackForm,
    submitFeedback,
  } = useMatchActions({
    initialDashboard,
    currentUserId: initialUser?.id ?? null,
  });

  const recentMatchHistory = dashboard?.recentMatchHistory ?? [];

  return (
    <div className={dcx("app-page-shell app-page-shell-narrow")}>
      <header className={dcx("app-page-header")}>
        <Link href="/dashboard/match" className={dcx("app-page-back")}>
          ← 返回本轮匹配
        </Link>
        <p className={dcx("eyebrow")}>Weekly Match</p>
        <h1>过往匹配记录</h1>
        <p>
          仅当该轮为「已匹配且完整可见」时，可在卡片内继续发起联络或举报。
        </p>
        {savedMessage ? <p className={dcx("ui-form-message ui-form-message--success")}>{savedMessage}</p> : null}
        {error ? <p className={dcx("ui-form-message ui-form-message--error")}>{error}</p> : null}
      </header>

      <section className={dcx("ui-card ui-card--padded")} aria-label="过往匹配">
        <div className={dcx("ui-card-header")}>
          <h2 className={dcx("ui-card-title")}>过往匹配</h2>
          {recentMatchHistory.length > 0 ? (
            <span className={dcx("semantic-status semantic-status--neutral")}>
              最近 {recentMatchHistory.length} 轮
            </span>
          ) : null}
        </div>
        <MatchHistoryList
          history={recentMatchHistory}
          currentUserId={initialUser.id}
          saving={saving}
          reportFormIsOpenForMatch={reportFormIsOpenForMatch}
          onRequestContact={(id) => void requestContact(id)}
          onToggleReport={(id) => toggleReportForm(id)}
          onToggleFeedback={(id, existing) => toggleFeedbackForm(id, existing)}
        />
      </section>

      <ReportForm
        open={reportOpen && reportTargetMatchId !== null}
        reason={reportReason}
        details={reportDetails}
        saving={saving === "report"}
        onReasonChange={setReportReason}
        onDetailsChange={setReportDetails}
        onSubmit={() => void submitReport()}
        onCancel={closeReportForm}
      />

      <FeedbackForm
        open={feedbackOpen && feedbackTargetMatchId !== null}
        rating={feedbackRating}
        comment={feedbackComment}
        saving={saving === "feedback"}
        onRatingChange={setFeedbackRating}
        onCommentChange={setFeedbackComment}
        onSubmit={() => void submitFeedback()}
        onCancel={closeFeedbackForm}
      />
    </div>
  );
}
