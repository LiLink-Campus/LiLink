"use client";

import { dcx } from "../../_lib/dashboard-class-names";
import Link from "next/link";
import { useMemo, useState } from "react";
import { VISUAL_PREVIEW } from "../../../../lib/visual-preview/mode";
import { historyCardExamples } from "./history-preview";
import styles from "./match-history.module.css";
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
  const [preview, setPreview] = useState(VISUAL_PREVIEW ? "examples" : "actual");
  const sourceDashboard = useMemo(() => !VISUAL_PREVIEW || preview === "actual" ? initialDashboard : {
    ...initialDashboard,
    recentMatchHistory: preview === "empty" ? [] : historyCardExamples(initialUser.id),
  }, [initialDashboard, initialUser.id, preview]);

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
    initialDashboard: sourceDashboard,
    currentUserId: initialUser?.id ?? null,
  });

  const recentMatchHistory = (dashboard?.recentMatchHistory ?? []).slice(0, 3);

  return (
    <div className={dcx("app-page-shell app-page-shell-narrow")}>
      {VISUAL_PREVIEW && <label className={styles.preview}>历史卡片预览<select value={preview} onChange={e => setPreview(e.target.value)}><option value="examples">三种卡片示例</option><option value="actual">当前数据</option><option value="empty">暂无记录</option></select></label>}
      <header className={styles.header}>
        <Link href="/dashboard/match" className={styles.back}>← 返回本轮匹配</Link>
        <div className={styles.titleRow}><h1>过往匹配记录</h1>{recentMatchHistory.length > 0 && <span>最近 {recentMatchHistory.length} 轮</span>}</div>
        <p>查看最近三轮的参与情况与匹配结果。</p>
      </header>
      {savedMessage ? <p role="status" className={dcx("ui-form-message ui-form-message--success")}>{savedMessage}</p> : null}
      {error ? <p role="alert" className={dcx("ui-form-message ui-form-message--error")}>{error}</p> : null}
      <section aria-label="过往匹配">
        {recentMatchHistory.length === 0 ? <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">♡</span>
          <h2>还没有过往匹配记录</h2>
          <p>这里会展示最近三轮的参与情况与匹配结果。</p>
          <Link href="/dashboard/match" className={styles.primary}>返回本轮匹配</Link>
        </div> : <MatchHistoryList
          history={recentMatchHistory}
          currentUserId={initialUser.id}
          saving={saving}
          reportFormIsOpenForMatch={reportFormIsOpenForMatch}
          onRequestContact={(id) => void requestContact(id)}
          onToggleReport={(id) => toggleReportForm(id)}
        />}
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
