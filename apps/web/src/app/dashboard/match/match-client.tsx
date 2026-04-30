"use client";

import type { AuthMePayload } from "../../../lib/api";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { MatchExplanation } from "../_components/MatchExplanation";
import { MatchHistoryList } from "../_components/MatchHistoryList";
import { ReportForm } from "../_components/ReportForm";
import { useMatchActions } from "../_components/useMatchActions";
import {
  canEditCurrentCycleParticipation,
  REPORT_FORM_SECTION_ID,
  reportHandlingChipLabel,
} from "../_lib/format";
import type { DashboardPayload } from "../_lib/types";
import { useLocale } from "../../locale-context";

const MATCH_COPY = {
  "zh-CN": {
    title: "本轮匹配结果",
    intro:
      "这里显示本轮揭晓后的匹配对象、引荐邮件状态以及联络/举报入口；下方是最近几轮的历史回顾。",
    noMatchTitle: "本轮未匹配到对象",
    noMatchBodyOne: (codename: string) =>
      `你已参加「${codename}」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。`,
    noMatchBodyTwo:
      "下一轮开放报名时，回到「首页」即可再次参与；你也可以更新问卷，提高下次匹配成功率。",
    limitedTitle: "本轮匹配已受限",
    limitedReported:
      "你已举报本轮匹配对象，对方的可识别信息已被隐藏。系统已将该对象从你后续轮次中隔离。",
    limitedBlocked:
      "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。",
    score: "匹配度",
    introTitle: "引荐与说明",
    matchTitle: "本轮匹配",
    introducedBody:
      "引荐已完成：系统已向你与对方的注册邮箱各发送一封引荐邮件（含联络方式与下方说明）。请查收收件箱及垃圾邮件夹后，再通过邮件与对方联系。",
    hiddenBeforeIntro:
      "揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。",
    email: "联络邮箱：",
    introLine: "对方介绍：",
    introducedNote: "以下内容与发至你邮箱的引荐邮件中的一致。",
    pendingNote:
      "系统根据问卷与客观条件生成；点击「双方引荐联系」后，相同说明也会出现在通知邮件里。",
    emptyReason: "暂无匹配理由条目。",
    introducedChip: "已引荐",
    sending: "发送中…",
    requestContact: "双方引荐联系",
    report: "举报",
    missingIntentTitle: "待选择本周意图",
    missingIntentBody:
      "当前这轮还没有保存可用的匹配意图。回到「首页」用本周参与开关确认 Friend、Date 或 Both 后，系统会按这次确认后的设置参与匹配。",
    lockedTitle: "本轮已锁定",
    lockedNoIntent:
      "本轮报名已经截止，而且这轮没有保存可用的匹配意图，因此系统不会按本轮为你参与匹配。",
    lockedNoIntentNext:
      "你仍可继续完善问卷资料，等待下一轮开放后再选择 Friend、Date 或 Both。",
    waitingTitle: "等待本轮揭晓",
    noResultTitle: "还没有匹配结果",
    waitingSaved:
      "你已填写问卷并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可在「资料」中修改信息。",
    waitingDraft: "本轮揭晓后将在此显示匹配说明与后续操作。",
    continueProfileTitle: "继续完善资料",
    lockedSaved:
      "本轮报名已经截止，当前不能再参加或修改本周意图。你可以继续完善问卷资料，等待下一轮开放。",
    lockedDraft:
      "本轮报名已经截止。你仍可继续填写和完善问卷资料，为下一轮开放后的报名做准备。",
    waitingMatchTitle: "等待匹配",
    savedNoJoin:
      "你已保存问卷。若尚未参加本轮，可回到「首页」打开本周参与开关报名；揭晓后返回此处查看结果。",
    draftNoJoin: "请先在「资料」完成问卷，然后回到「首页」报名参加当前轮次。",
    historyAria: "历史回顾",
    historyTitle: "历史回顾",
    recentRounds: (count: number) => `最近 ${count} 轮`,
    historyHint:
      "仅当该轮为「已匹配且完整可见」时，可在卡片内继续发起联络或举报。",
  },
  "en-US": {
    title: "This round's match",
    intro:
      "This page shows the revealed match, introduction email status, contact/report actions, and recent round history.",
    noMatchTitle: "No match in this round",
    noMatchBodyOne: (codename: string) =>
      `You joined ${codename}, but there were not enough compatible pairings to generate a match.`,
    noMatchBodyTwo:
      "When the next round opens, return to Home to join again. You can also update your questionnaire to improve future matching.",
    limitedTitle: "This match is limited",
    limitedReported:
      "You reported this match, so the other person's identifying information is hidden. They have been isolated from your future rounds.",
    limitedBlocked:
      "A block exists between you and this match, so identifying information is hidden.",
    score: "Score",
    introTitle: "Introduction and notes",
    matchTitle: "Current match",
    introducedBody:
      "Introduction completed: LiLink sent both registered emails an introduction message with contact details and the notes below. Check your inbox and spam folder before contacting them by email.",
    hiddenBeforeIntro:
      "Before introduction, school, display name, and other identifying information stay hidden. The notes below come only from objective filters and questionnaire answers.",
    email: "Contact email: ",
    introLine: "Intro: ",
    introducedNote: "This content matches the introduction email sent to you.",
    pendingNote:
      "Generated from questionnaire answers and objective conditions. The same notes will appear in the email after you request mutual introduction.",
    emptyReason: "No match reason entries yet.",
    introducedChip: "Introduced",
    sending: "Sending...",
    requestContact: "Request introduction",
    report: "Report",
    missingIntentTitle: "Weekly intent needed",
    missingIntentBody:
      "This round has no usable saved intent. Return to Home and confirm Friend, Date, or Both before matching uses this round.",
    lockedTitle: "Round locked",
    lockedNoIntent:
      "Registration has closed and this round has no usable saved intent, so LiLink will not match you in this round.",
    lockedNoIntentNext:
      "You can keep editing your questionnaire and choose Friend, Date, or Both when the next round opens.",
    waitingTitle: "Waiting for reveal",
    noResultTitle: "No match result yet",
    waitingSaved:
      "You have completed the questionnaire and joined this round. Match notes and next steps will appear here after reveal; you can still edit Profile before then.",
    waitingDraft:
      "Match notes and next steps will appear here after this round is revealed.",
    continueProfileTitle: "Continue profile",
    lockedSaved:
      "Registration has closed, so you cannot join or change weekly intent now. You can still edit your questionnaire for the next round.",
    lockedDraft:
      "Registration has closed. You can keep filling out your questionnaire for the next open round.",
    waitingMatchTitle: "Waiting for match",
    savedNoJoin:
      "Your questionnaire is saved. If you have not joined this round, return to Home and turn on weekly participation.",
    draftNoJoin:
      "Complete your questionnaire in Profile, then return to Home to join the current round.",
    historyAria: "History",
    historyTitle: "History",
    recentRounds: (count: number) => `Recent ${count} rounds`,
    historyHint:
      "Only fully visible matched rounds can still be contacted or reported from the card.",
  },
} as const;

export function MatchClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  const { locale } = useLocale();
  const copy = MATCH_COPY[locale];
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

  const latestMatch = dashboard?.latestMatch ?? null;
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;

  const introduced = Boolean(latestMatch?.introducedAt);
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const currentCycle = dashboard?.currentCycle ?? null;
  const canEditParticipation = canEditCurrentCycleParticipation(currentCycle);
  const currentCycleIsLocked = currentCycle !== null && !canEditParticipation;
  const hasMissingIntent =
    currentCycle?.participationStatus === "OPTED_IN" &&
    !currentCycle.intent &&
    canEditParticipation;

  const currentDisplayedCycleId = dashboard?.lastRevealedRound?.cycleId ?? null;
  const recentHistory = (dashboard?.recentMatchHistory ?? [])
    .filter((item) => {
      if (currentDisplayedCycleId && item.cycleId === currentDisplayedCycleId) {
        return false;
      }
      if (latestMatch && item.match?.id === latestMatch.id) {
        return false;
      }
      return true;
    })
    .slice(0, 2);

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <header className="app-page-header">
        <p className="eyebrow">Weekly Match</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="app-card">
        {dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" &&
        !dashboard.lastRevealedRound.matched ? (
          <>
            <div className="app-card-head">
              <h2>{copy.noMatchTitle}</h2>
            </div>
            <p className="app-card-muted">
              {copy.noMatchBodyOne(dashboard.lastRevealedRound.codename)}
            </p>
            <p className="app-card-muted">{copy.noMatchBodyTwo}</p>
          </>
        ) : dashboard?.latestMatchVisibility === "LIMITED" && latestMatch ? (
          <>
            <div className="app-card-head">
              <h2>{copy.limitedTitle}</h2>
              {(() => {
                const label = reportHandlingChipLabel(
                  latestMatch.reportStatus,
                  locale,
                );
                return label ? (
                  <span className="app-card-status is-warn">{label}</span>
                ) : null;
              })()}
            </div>
            <p className="app-card-muted">
              {dashboard.latestMatchLimitedReason === "REPORTED"
                ? copy.limitedReported
                : copy.limitedBlocked}
            </p>
            <span className="app-match-score">
              {copy.score} <strong>{latestMatch.score.toFixed(1)}</strong> / 100
            </span>
          </>
        ) : counterpart && latestMatch ? (
          <>
            <div className="app-card-head">
              <h2>{introduced ? copy.introTitle : copy.matchTitle}</h2>
              <span className="app-match-score">
                {copy.score} <strong>{latestMatch.score.toFixed(1)}</strong> / 100
              </span>
            </div>
            {introduced ? (
              <p className="app-card-muted">{copy.introducedBody}</p>
            ) : (
              <p className="app-card-muted">{copy.hiddenBeforeIntro}</p>
            )}

            {introduced && counterpart.email ? (
              <p className="form-success app-match-email">
                {copy.email}
                {counterpart.email}
              </p>
            ) : null}
            {introduced && counterpart.introLine ? (
              <p className="app-card-muted app-match-intro">
                {copy.introLine}
                {counterpart.introLine}
              </p>
            ) : null}

            <MatchExplanation
              note={
                introduced
                  ? copy.introducedNote
                  : copy.pendingNote
              }
              reason={latestMatch.reason}
              reasons={latestMatch.reasons}
              conversationTopics={latestMatch.conversationTopics}
              emptyReasonFallback={copy.emptyReason}
            />

            <div className="auth-actions">
              {introduced ? (
                <span className="domain-chip">{copy.introducedChip}</span>
              ) : (
                <button
                  className="button-primary"
                  disabled={saving === "contact"}
                  type="button"
                  onClick={() => void requestContact(latestMatch.id)}
                >
                  {saving === "contact" ? copy.sending : copy.requestContact}
                </button>
              )}
              {(() => {
                const label = reportHandlingChipLabel(
                  latestMatch.reportStatus,
                  locale,
                );
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
                    {copy.report}
                  </button>
                );
              })()}
            </div>
          </>
        ) : (
          <>
            {hasMissingIntent ? (
              <>
                <div className="app-card-head">
                  <h2>{copy.missingIntentTitle}</h2>
                </div>
                <p className="app-card-muted">{copy.missingIntentBody}</p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              !currentCycle.intent &&
              currentCycleIsLocked ? (
              <>
                <div className="app-card-head">
                  <h2>{copy.lockedTitle}</h2>
                </div>
                <p className="app-card-muted">{copy.lockedNoIntent}</p>
                <p className="app-card-muted">{copy.lockedNoIntentNext}</p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              (currentCycle.status === "OPEN" ||
                currentCycle.status === "PREPARING" ||
                currentCycle.status === "REVEAL_READY") ? (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire
                      ? copy.waitingTitle
                      : copy.noResultTitle}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? copy.waitingSaved
                    : copy.waitingDraft}
                </p>
              </>
            ) : currentCycleIsLocked ? (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire
                      ? copy.lockedTitle
                      : copy.continueProfileTitle}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? copy.lockedSaved
                    : copy.lockedDraft}
                </p>
              </>
            ) : (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire
                      ? copy.waitingMatchTitle
                      : copy.noResultTitle}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? copy.savedNoJoin
                    : copy.draftNoJoin}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="app-card" aria-label={copy.historyAria}>
        <div className="app-card-head">
          <h2 className="app-card-title">{copy.historyTitle}</h2>
          <span className="app-card-status">
            {copy.recentRounds(recentHistory.length)}
          </span>
        </div>
        <p className="app-card-muted">{copy.historyHint}</p>
        <MatchHistoryList
          history={recentHistory}
          currentUserId={initialUser.id}
          saving={saving}
          reportFormIsOpenForMatch={reportFormIsOpenForMatch}
          onRequestContact={(id) => void requestContact(id)}
          onToggleReport={(id) => toggleReportForm(id)}
        />
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
    </div>
  );
}
