"use client";

import Link from "next/link";
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
import type { DashboardMeetupSummary } from "../_lib/types";
import {
  formatMeetupTimeRange,
  PROGRESS_LABELS,
} from "../meetup/_components/meetup-format";

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
      ? (latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null)
      : null;

  const introduced = Boolean(latestMatch?.introducedAt);
  const publicContact =
    counterpart?.contact ??
    (counterpart?.email
      ? { label: "联络邮箱", value: counterpart.email }
      : null);
  const meetupSummary = dashboard?.meetupSummary ?? null;
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
              你已参加「{dashboard.lastRevealedRound.codename}
              」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。
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
                引荐已完成：系统已向你与对方的注册邮箱各发送一封引荐邮件（含联络方式与下方说明）。请查收收件箱及垃圾邮件夹后，按对方公开的联系方式联系。
              </p>
            ) : (
              <p className="app-card-muted">
                揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。
              </p>
            )}

            {introduced && publicContact ? (
              <p className="form-success app-match-email">
                联系方式：{publicContact.label} {publicContact.value}
              </p>
            ) : null}
            {introduced && counterpart.introLine ? (
              <p className="app-card-muted app-match-intro">
                对方介绍：{counterpart.introLine}
              </p>
            ) : null}

            <MatchExplanation
              note={
                introduced
                  ? "以下内容与发至你邮箱的引荐邮件中的一致。"
                  : "系统根据问卷与客观条件生成；点击「双方引荐联系」后，相同说明也会出现在通知邮件里。"
              }
              reason={latestMatch.reason}
              reasons={latestMatch.reasons}
              conversationTopics={latestMatch.conversationTopics}
              emptyReasonFallback="暂无匹配理由条目。"
            />

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
                  <h2>待选择本周意向</h2>
                </div>
                <p className="app-card-muted">
                  当前这轮还没有保存可用的匹配意向。回到「首页」用本周参与开关确认
                  Friend、Date 或 Both 后，系统会按这次确认后的设置参与匹配。
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
                  本轮报名已经截止，而且这轮没有保存可用的匹配意向，因此系统不会按本轮为你参与匹配。
                </p>
                <p className="app-card-muted">
                  你仍可继续完善匹配资料，等待下一轮开放后再选择 Friend、Date 或
                  Both。
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
                    ? "你已填写匹配资料并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可在「匹配资料」中修改信息。"
                    : "本轮揭晓后将在此显示匹配说明与后续操作。"}
                </p>
              </>
            ) : currentCycleIsLocked ? (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire ? "本轮已锁定" : "继续完善匹配资料"}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? "本轮报名已经截止，当前不能再参加或修改本周意向。你可以继续完善匹配资料，等待下一轮开放。"
                    : "本轮报名已经截止。你仍可继续填写和完善匹配资料，为下一轮开放后的报名做准备。"}
                </p>
              </>
            ) : (
              <>
                <div className="app-card-head">
                  <h2>
                    {hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}
                  </h2>
                </div>
                <p className="app-card-muted">
                  {hasSavedQuestionnaire
                    ? "你已保存问卷。若尚未参加本轮，可回到「首页」打开本周参与开关报名；揭晓后返回此处查看结果。"
                    : "请先在「匹配资料」完成问卷，然后回到「首页」报名参加当前轮次。"}
                </p>
              </>
            )}
          </>
        )}
      </section>

      <MeetupMatchSummaryCard
        latestMatchId={latestMatch?.id ?? null}
        introduced={introduced}
        summary={meetupSummary}
      />

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

function MeetupMatchSummaryCard({
  latestMatchId,
  introduced,
  summary,
}: {
  latestMatchId: string | null;
  introduced: boolean;
  summary: DashboardMeetupSummary | null;
}) {
  const canStart = latestMatchId !== null && introduced && summary === null;
  const terminal =
    summary?.status === "CANCELED" ||
    summary?.status === "EXPIRED" ||
    summary?.status === "ARCHIVED";

  if (!summary && !canStart) return null;

  return (
    <section
      className="app-card meetup-match-summary"
      aria-label="第一次见面安排"
    >
      <div className="app-card-head">
        <h2 className="app-card-title">第一次见面安排</h2>
        {summary ? (
          <span className="app-card-status">
            {PROGRESS_LABELS[summary.progressStatus]}
          </span>
        ) : (
          <span className="app-card-status is-accent">可安排</span>
        )}
      </div>

      {summary ? (
        <>
          {terminal ? (
            <p className="app-card-muted">
              {summary.terminalText ??
                "本次见面安排已结束，当前版本暂不支持重新发起。"}
            </p>
          ) : summary.status === "LOCKED" ? (
            <>
              <p className="app-card-muted">
                你们已确认第一次见面的时间和地点。
              </p>
              <div className="meetup-summary-facts">
                <div className="meetup-plan-fact">
                  <span>时间</span>
                  <strong>
                    {formatMeetupTimeRange(
                      summary.confirmedStartsAt,
                      summary.confirmedEndsAt,
                    )}
                  </strong>
                </div>
                <div className="meetup-plan-fact">
                  <span>地点</span>
                  <strong>{summary.confirmedPlaceName ?? "地点待确认"}</strong>
                </div>
              </div>
              <Link
                className="button-primary meetup-inline-link"
                href={summary.href}
              >
                查看见面安排
              </Link>
            </>
          ) : (
            <>
              <p className="app-card-muted">
                第一次见面仍在协商中；首页待办会提示当前轮到谁回应。
              </p>
              <Link
                className="button-primary meetup-inline-link"
                href={summary.href}
              >
                继续安排第一次见面
              </Link>
            </>
          )}
        </>
      ) : latestMatchId ? (
        <>
          <p className="app-card-muted">
            引荐已完成后，可以向对方发出第一次见面的时间和地点候选。
          </p>
          <Link
            className="button-primary meetup-inline-link"
            href={`/dashboard/meetup/start?matchId=${encodeURIComponent(
              latestMatchId,
            )}`}
          >
            安排第一次见面
          </Link>
        </>
      ) : null}
    </section>
  );
}
