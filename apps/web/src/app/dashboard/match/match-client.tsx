"use client";

import type { AuthMePayload } from "../../../lib/api";
import { ReportForm } from "../_components/ReportForm";
import { SubPageNav } from "../_components/SubPageNav";
import { useMatchActions } from "../_components/useMatchActions";
import {
  canEditCurrentCycleParticipation,
  REPORT_FORM_SECTION_ID,
  normalizeConversationTopics,
  normalizeMatchReasons,
  reportHandlingChipLabel,
} from "../_lib/format";
import type { DashboardPayload } from "../_lib/types";

export function MatchClient({
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

  // No manual `useMemo` here — the React Compiler auto-memoizes derived
  // values, and a manual `useMemo` whose body reads `initialUser.id`
  // (deeper than its dep `initialUser`) trips the
  // `react-hooks/preserve-manual-memoization` rule because the compiler
  // cannot prove the manual memo is equivalent to its own.
  const latestMatch = dashboard?.latestMatch ?? null;
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;

  const latestMatchReasons = normalizeMatchReasons(latestMatch?.reasons);
  const latestMatchReason = latestMatch?.reason?.trim() ?? "";
  const latestConversationTopics = normalizeConversationTopics(
    latestMatch?.conversationTopics,
  );

  const introduced = Boolean(latestMatch?.introducedAt);
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const currentCycle = dashboard?.currentCycle ?? null;
  const canEditParticipation = canEditCurrentCycleParticipation(currentCycle);
  const currentCycleIsLocked = currentCycle !== null && !canEditParticipation;
  const hasMissingIntent =
    currentCycle?.participationStatus === "OPTED_IN" &&
    !currentCycle.intent &&
    canEditParticipation;

  return (
    <main className="page-shell dashboard-page">
      <SubPageNav />

      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">本轮匹配</p>
        <h1>本轮匹配结果</h1>
        <p className="dashboard-lede">
          这里显示本轮揭晓后的匹配对象、引荐邮件状态以及联络/举报入口。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="content-panel dashboard-panel-wide">
        {dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" &&
        !dashboard.lastRevealedRound.matched ? (
          <>
            <h2>本轮未匹配到对象</h2>
            <p className="dashboard-muted">
              你已参加「{dashboard.lastRevealedRound.codename}」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。
            </p>
            <p className="dashboard-muted">
              下一轮开放报名时，回到「本周意图」即可再次参与；你也可以更新问卷，提高下次匹配成功率。
            </p>
          </>
        ) : dashboard?.latestMatchVisibility === "LIMITED" && latestMatch ? (
          <>
            <h2>本轮匹配已受限</h2>
            <p className="dashboard-muted">
              {dashboard.latestMatchLimitedReason === "REPORTED"
                ? "你已举报本轮匹配对象，对方的可识别信息已被隐藏。系统已将该对象从你后续轮次中隔离。"
                : "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。"}
            </p>
            <p className="dashboard-muted">
              匹配度：<strong>{latestMatch.score.toFixed(1)}</strong> / 100
            </p>
            {(() => {
              const label = reportHandlingChipLabel(latestMatch.reportStatus);
              return label ? <span className="domain-chip">{label}</span> : null;
            })()}
          </>
        ) : counterpart && latestMatch ? (
          <>
            <h2>{introduced ? "引荐与说明" : "本轮匹配"}</h2>
            {introduced ? (
              <p className="dashboard-muted" style={{ marginTop: "0.35rem" }}>
                引荐已完成：系统已向你与对方的注册邮箱各发送一封引荐邮件（含联络方式与下方说明）。请查收收件箱及垃圾邮件夹后，再通过邮件与对方联系。
              </p>
            ) : null}
            <p className="dashboard-match-score">
              匹配度：<strong>{latestMatch.score.toFixed(1)}</strong> / 100
            </p>
            {!introduced ? (
              <p className="dashboard-muted">
                揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。
              </p>
            ) : null}
            {introduced && counterpart.email ? (
              <p className="form-success dashboard-match-email">
                联络邮箱：{counterpart.email}
              </p>
            ) : null}
            {introduced && counterpart.introLine ? (
              <p className="dashboard-muted dashboard-match-intro">
                对方介绍：{counterpart.introLine}
              </p>
            ) : null}
            <div className="dashboard-match-reasons">
              <p
                className="eyebrow"
                style={{ marginTop: "1.15rem", marginBottom: "0.35rem" }}
              >
                匹配理由
              </p>
              {introduced ? (
                <p
                  className="dashboard-muted"
                  style={{ margin: "0 0 0.65rem" }}
                >
                  以下内容与发至你邮箱的引荐邮件中的一致。
                </p>
              ) : (
                <p
                  className="dashboard-muted"
                  style={{ margin: "0 0 0.65rem" }}
                >
                  系统根据问卷与客观条件生成；点击「双方引荐联系」后，相同说明也会出现在通知邮件里。
                </p>
              )}
              {latestMatchReason ? (
                <p className="dashboard-muted" style={{ margin: "0 0 0.75rem" }}>
                  {latestMatchReason}
                </p>
              ) : latestMatchReasons.length > 0 ? (
                <ul className="reason-list" style={{ marginTop: 0 }}>
                  {latestMatchReasons.map((reason, index) => (
                    <li key={`${index}-${reason.slice(0, 48)}`}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p
                  className="dashboard-muted"
                  style={{ margin: "0 0 0.75rem" }}
                >
                  暂无匹配理由条目。
                </p>
              )}
              {latestConversationTopics.length > 0 ? (
                <>
                  <p
                    className="eyebrow"
                    style={{ marginTop: "1rem", marginBottom: "0.35rem" }}
                  >
                    聊天话题
                  </p>
                  <ul className="reason-list" style={{ marginTop: 0 }}>
                    {latestConversationTopics.map((topic, index) => (
                      <li key={`${index}-${topic.slice(0, 48)}`}>{topic}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
            <div className="auth-actions">
              {introduced ? (
                <span className="domain-chip">已引荐</span>
              ) : (
                <button
                  className="button-primary"
                  disabled={saving === "contact"}
                  type="button"
                  onClick={() => void requestContact(latestMatch.id)}
                >
                  {saving === "contact" ? "发送中…" : "双方引荐联系"}
                </button>
              )}
              {(() => {
                const label = reportHandlingChipLabel(latestMatch.reportStatus);
                return label ? (
                  <span className="domain-chip">{label}</span>
                ) : (
                  <button
                    className="button-secondary"
                    aria-controls={REPORT_FORM_SECTION_ID}
                    aria-expanded={reportFormIsOpenForMatch(latestMatch.id)}
                    disabled={saving === "report"}
                    type="button"
                    onClick={() => toggleReportForm(latestMatch.id)}
                  >
                    举报
                  </button>
                );
              })()}
            </div>
          </>
        ) : (
          <>
            {hasMissingIntent ? (
              <>
                <h2>待选择本周意图</h2>
                <p className="dashboard-muted">
                  当前这轮还没有保存可用的匹配意图。前往「本周意图」页面确认
                  Friend、Date 或 Both 后，系统会按这次确认后的设置参与匹配。
                </p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              !currentCycle.intent &&
              currentCycleIsLocked ? (
              <>
                <h2>本轮已锁定</h2>
                <p className="dashboard-muted">
                  本轮报名已经截止，而且这轮没有保存可用的匹配意图，因此系统不会按本轮为你参与匹配。
                </p>
                <p className="dashboard-muted">
                  你仍可继续完善问卷资料，等待下一轮开放后再选择 Friend、Date 或 Both。
                </p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              (currentCycle.status === "OPEN" ||
                currentCycle.status === "PREPARING" ||
                currentCycle.status === "REVEAL_READY") ? (
              <>
                <h2>
                  {hasSavedQuestionnaire ? "等待本轮揭晓" : "还没有匹配结果"}
                </h2>
                <p className="dashboard-muted">
                  {hasSavedQuestionnaire
                    ? "你已填写问卷并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可在「问卷资料」中修改资料。"
                    : "本轮揭晓后将在此显示匹配说明与后续操作。"}
                </p>
              </>
            ) : currentCycleIsLocked ? (
              <>
                <h2>{hasSavedQuestionnaire ? "本轮已锁定" : "继续完善资料"}</h2>
                <p className="dashboard-muted">
                  {hasSavedQuestionnaire
                    ? "本轮报名已经截止，当前不能再参加或修改本周意图。你可以继续完善问卷资料，等待下一轮开放。"
                    : "本轮报名已经截止。你仍可继续填写和完善问卷资料，为下一轮开放后的报名做准备。"}
                </p>
              </>
            ) : (
              <>
                <h2>{hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}</h2>
                <p className="dashboard-muted">
                  {hasSavedQuestionnaire
                    ? "你已保存问卷。若尚未参加本轮，可前往「本周意图」选择 Friend / Date / Both 报名；揭晓后返回此处查看结果。"
                    : "请先在「问卷资料」完成问卷，然后到「本周意图」报名参加当前轮次。"}
                </p>
              </>
            )}
          </>
        )}
      </section>

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
