"use client";

import Link from "next/link";
import type { AuthMePayload } from "../../../../lib/api";
import { useDashboardSessionSeed } from "../../_components/DashboardSessionSeed";
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
  } = useMatchActions({
    initialDashboard,
    currentUserId: initialUser?.id ?? null,
  });

  const recentMatchHistory = dashboard?.recentMatchHistory ?? [];

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <header className="app-page-header">
        <Link href="/dashboard/match" className="app-page-back">
          ← 返回本轮匹配
        </Link>
        <p className="eyebrow">Weekly Match</p>
        <h1>过往匹配记录</h1>
        <p>
          仅当该轮为「已匹配且完整可见」时，可在卡片内继续发起联络或举报。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="app-card" aria-label="过往匹配">
        <div className="app-card-head">
          <h2 className="app-card-title">过往匹配</h2>
          {recentMatchHistory.length > 0 ? (
            <span className="app-card-status">
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
    </div>
  );
}
