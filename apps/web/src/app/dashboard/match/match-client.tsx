"use client";

import type { AuthMePayload } from "../../../lib/api";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { MatchHistoryList } from "../_components/MatchHistoryList";
import { ReportForm } from "../_components/ReportForm";
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

  const recentHistory = dashboard?.recentMatchHistory ?? [];

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <header className="app-page-header">
        <p className="eyebrow">Weekly Match</p>
        <h1>本轮匹配结果</h1>
        <p>
          这里显示本轮揭晓后的匹配对象、引荐邮件状态以及联络/举报入口；下方是最近几轮的历史回顾。
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="app-card">
        {dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" &&
        !dashboard.lastRevealedRound.matched ? (
          <>
            <div className="app-card-head">
              <h2>本轮未匹配到对象</h2>
            </div>
            <p className="app-card-muted">
              你已参加「{dashboard.lastRevealedRound.codename}」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。
            </p>
            <p className="app-card-muted">
              下一轮开放报名时，回到「首页」即可再次参与；你也可以更新问卷，提高下次匹配成功率。
            </p>
          </>
        ) : dashboard?.latestMatchVisibility === "LIMITED" && latestMatch ? (
          <>
            <div className="app-card-head">
              <h2>本轮匹配已受限</h2>
              {(() => {
                const label = reportHandlingChipLabel(latestMatch.reportStatus);
                return label ? (
                  <span className="app-card-status is-warn">{label}</span>
                ) : null;
              })()}
            </div>
            <p className="app-card-muted">
              {dashboard.latestMatchLimitedReason === "REPORTED"
                ? "你已举报本轮匹配对象，对方的可识别信息已被隐藏。系统已将该对象从你后续轮次中隔离。"
                : "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。"}
            </p>
            <span className="app-match-score">
              匹配度 <strong>{latestMatch.score.toFixed(1)}</strong> / 100
            </span>
          </>
        ) : counterpart && latestMatch ? (
          <>
            <div className="app-card-head">
              <h2>{introduced ? "引荐与说明" : "本轮匹配"}</h2>
              <span className="app-match-score">
                匹配度 <strong>{latestMatch.score.toFixed(1)}</strong> / 100
              </span>
            </div>
            {introduced ? (
              <p className="app-card-muted">
                引荐已完成：系统已向你与对方的注册邮箱各发送一封引荐邮件（含联络方式与下方说明）。请查收收件箱及垃圾邮件夹后，再通过邮件与对方联系。
              </p>
            ) : (
              <p className="app-card-muted">
                揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。
              </p>
            )}

            {introduced && counterpart.email ? (
              <p className="form-success app-match-email">
                联络邮箱：{counterpart.email}
              </p>
            ) : null}
            {introduced && counterpart.introLine ? (
              <p className="app-card-muted app-match-intro">
                对方介绍：{counterpart.introLine}
              </p>
            ) : null}

            <div>
              <p className="eyebrow">匹配理由</p>
              {introduced ? (
                <p className="app-card-muted">
                  以下内容与发至你邮箱的引荐邮件中的一致。
                </p>
              ) : (
                <p className="app-card-muted">
                  系统根据问卷与客观条件生成；点击「双方引荐联系」后，相同说明也会出现在通知邮件里。
                </p>
              )}
              {latestMatchReason ? (
                <p className="app-card-muted">{latestMatchReason}</p>
              ) : latestMatchReasons.length > 0 ? (
                <ul className="reason-list">
                  {latestMatchReasons.map((reason, index) => (
                    <li key={`${index}-${reason.slice(0, 48)}`}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="app-card-muted">暂无匹配理由条目。</p>
              )}
              {latestConversationTopics.length > 0 ? (
                <>
                  <p className="eyebrow conversation-topic-heading">
                    聊天话题
                  </p>
                  <ul className="conversation-topic-list">
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
                <div className="app-card-head">
                  <h2>待选择本周意图</h2>
                </div>
                <p className="app-card-muted">
                  当前这轮还没有保存可用的匹配意图。回到「首页」用本周参与开关确认 Friend、Date 或 Both 后，系统会按这次确认后的设置参与匹配。
                </p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              !currentCycle.intent &&
              currentCycleIsLocked ? (
              <>
                <div className="app-card-head">
                  <h2>本轮已锁定</h2>
                </div>
                <p className="app-card-muted">
                  本轮报名已经截止，而且这轮没有保存可用的匹配意图，因此系统不会按本轮为你参与匹配。
                </p>
                <p className="app-card-muted">
                  你仍可继续完善问卷资料，等待下一轮开放后再选择 Friend、Date 或 Both。
                </p>
              </>
            ) : currentCycle?.participationStatus === "OPTED_IN" &&
              (currentCycle.status === "OPEN" ||
                currentCycle.status === "PREPARING" ||
                currentCycle.status === "REVEAL_READY") ? (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire ? "等待本轮揭晓" : "还没有匹配结果"}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? "你已填写问卷并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可在「资料」中修改信息。"
                    : "本轮揭晓后将在此显示匹配说明与后续操作。"}
                </p>
              </>
            ) : currentCycleIsLocked ? (
              <>
                <div className="app-card-head">
                  <h2>{hasSavedQuestionnaire ? "本轮已锁定" : "继续完善资料"}</h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? "本轮报名已经截止，当前不能再参加或修改本周意图。你可以继续完善问卷资料，等待下一轮开放。"
                    : "本轮报名已经截止。你仍可继续填写和完善问卷资料，为下一轮开放后的报名做准备。"}
                </p>
              </>
            ) : (
              <>
                <div className="app-card-head">
                  <h2>{hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}</h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? "你已保存问卷。若尚未参加本轮，可回到「首页」打开本周参与开关报名；揭晓后返回此处查看结果。"
                    : "请先在「资料」完成问卷，然后回到「首页」报名参加当前轮次。"}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="app-card" aria-label="历史回顾">
        <div className="app-card-head">
          <h2 className="app-card-title">历史回顾</h2>
          <span className="app-card-status">
            最近 {recentHistory.length} 轮
          </span>
        </div>
        <p className="app-card-muted">
          仅当该轮为「已匹配且完整可见」时，可在卡片内继续发起联络或举报。
        </p>
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
