"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { AuthMePayload } from "../../../lib/api";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { MatchExplanation } from "../_components/MatchExplanation";
import { MatchStateHero } from "../_components/MatchStateHero";
import { MeetupStatusRibbon } from "../_components/MeetupStatusRibbon";
import { ReportForm } from "../_components/ReportForm";
import { useMatchActions } from "../_components/useMatchActions";
import {
  canEditCurrentCycleParticipation,
  reportHandlingChipLabel,
} from "../_lib/format";
import type { DashboardPayload, DashboardTask } from "../_lib/types";

function avatarInitialFor(displayName: string | null | undefined) {
  const source = (displayName ?? "TA").trim();
  if (!source) return "TA";
  const char = Array.from(source)[0];
  return char ? char.toUpperCase() : "TA";
}

function findMeetupTaskFor(
  tasks: DashboardTask[] | undefined,
  matchId: string | null,
): DashboardTask | null {
  if (!tasks || !matchId) return null;
  return tasks.find((task) => task.type === "MEETUP" && task.matchId === matchId) ?? null;
}

export function MatchClient({
  initialUser,
  initialDashboard,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  const router = useRouter();
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
  } = useMatchActions({
    initialDashboard,
    currentUserId: initialUser?.id ?? null,
  });

  const recentMatchHistory = dashboard?.recentMatchHistory ?? [];
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
  const meetupTask = findMeetupTaskFor(dashboard?.tasks, latestMatch?.id ?? null);

  async function handleDirectInvite() {
    if (!latestMatch) return;
    try {
      await requestContact(latestMatch.id);
      router.push(
        `/dashboard/meetup/start?matchId=${encodeURIComponent(latestMatch.id)}`,
      );
    } catch {
      // requestContact already surfaces the failure via `error`
    }
  }

  const showMeetupRibbon = introduced && meetupSummary !== null;
  const showStartMeetupRibbon = introduced && meetupSummary === null && latestMatch !== null;
  const showExplanation =
    counterpart !== null && latestMatch !== null && dashboard?.latestMatchVisibility !== "LIMITED";

  let hero: ReactNode = null;

  if (
    dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" &&
    !dashboard.lastRevealedRound.matched &&
    !latestMatch
  ) {
    hero = (
      <MatchStateHero
        variant="empty"
        title="本轮未匹配到对象"
        subtitle={`「${dashboard.lastRevealedRound.codename}」`}
        body="本轮可配对人数不足或没有与你强相容的组合，因此没有为你生成匹配对象。下一轮开放报名时，回到首页即可再次参与；更新问卷也能提高下次成功率。"
        actions={[
          { label: "去完善匹配资料", href: "/dashboard/profile", variant: "primary" },
          { label: "查看历史", href: "/dashboard/match/history", variant: "secondary" },
        ]}
      />
    );
  } else if (dashboard?.latestMatchVisibility === "LIMITED" && latestMatch) {
    const reportLabel = reportHandlingChipLabel(latestMatch.reportStatus);
    hero = (
      <MatchStateHero
        variant="limited"
        title="本轮匹配已受限"
        subtitle="对方的可识别信息已隐藏"
        score={latestMatch.score}
        body={
          dashboard.latestMatchLimitedReason === "REPORTED"
            ? "你已举报本轮匹配对象，对方的可识别信息已被隐藏，系统已将该对象从你后续轮次中隔离。"
            : "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。"
        }
      >
        {reportLabel ? <span className="domain-chip">{reportLabel}</span> : null}
      </MatchStateHero>
    );
  } else if (counterpart && latestMatch) {
    const reportLabel = reportHandlingChipLabel(latestMatch.reportStatus);
    const counterpartName = counterpart.displayName ?? "TA";
    const initial = avatarInitialFor(counterpart.displayName);
    hero = (
      <MatchStateHero
        variant="matched"
        avatarInitial={initial}
        title={introduced ? counterpartName : "本轮为你匹配到 TA"}
        subtitle={
          introduced
            ? counterpart.schoolName ?? "已引荐双方"
            : counterpart.schoolName ?? "等你决定如何破冰"
        }
        score={latestMatch.score}
        body={null}
        contactLine={
          introduced && publicContact
            ? (
                <>
                  联系方式：{publicContact.label}{" "}
                  <strong>{publicContact.value}</strong>
                </>
              )
            : null
        }
        actions={
          [
            {
              label: saving === "contact" ? "处理中..." : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.2rem' }}>
                  发起见面邀请
                </span>
              ),
              onClick: () => void handleDirectInvite(),
              variant: "primary",
              disabled: saving === "contact",
              loading: saving === "contact",
              style: { background: 'linear-gradient(135deg, #df6b7c, #b93e5b)', border: 'none', color: '#fff' }
            },
            introduced
              ? {
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.2rem' }}>
                      已引荐
                    </span>
                  ),
                  variant: "secondary",
                  disabled: true,
                  style: {
                    background: '#f5f5f5',
                    border: '1px solid #ddd',
                    color: '#666',
                    cursor: 'default',
                  },
                }
              : {
                  label: saving === "contact" ? "处理中..." : (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.2rem' }}>
                      交换联系方式
                    </span>
                  ),
                  onClick: () => void requestContact(latestMatch.id),
                  variant: "secondary",
                  disabled: saving === "contact",
                  loading: saving === "contact",
                  style: { background: '#fff', border: '1px solid #ccc', color: '#333' },
                },
          ]
        }
      >
        {introduced && reportLabel ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "0.5rem"
            }}
          >
            <span className="domain-chip">{reportLabel}</span>
          </div>
        ) : null}

        {counterpart?.introLine ? (
          <p className="v2-match-hero-body" style={{ marginTop: "-0.25rem", color: 'var(--fg-secondary)', fontSize: '0.9rem' }}>
            <strong>对方介绍：</strong>
            {counterpart.introLine}
          </p>
        ) : null}

        {showExplanation && latestMatch ? (
          <div className="v2-match-hero-section">
            <MatchExplanation
              note={
                introduced
                  ? "以下内容与发至你邮箱的引荐邮件中的一致。"
                  : "以下匹配理由基于你和对方填写的匹配资料生成。"
              }
              reasons={latestMatch.reasons}
              conversationTopics={latestMatch.conversationTopics}
              emptyReasonFallback="暂无匹配理由条目。"
            />
          </div>
        ) : null}

        {showMeetupRibbon && meetupSummary ? (
          <div className="v2-match-hero-section">
            <MeetupStatusRibbon summary={meetupSummary} task={meetupTask} />
          </div>
        ) : null}

        {showStartMeetupRibbon && latestMatch ? (
          <div className="v2-match-hero-section" style={{ marginTop: '0.5rem' }}>
            <Link
              href={`/dashboard/meetup/start?matchId=${encodeURIComponent(latestMatch.id)}`}
              style={{ display: 'block', background: '#fdfbfa', padding: '1.25rem', borderRadius: '1rem', border: '1px solid #f8ecee', textDecoration: 'none', color: 'inherit' }}
              aria-label="安排第一次见面"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.05rem', color: '#333' }}>下一步 · 安排第一次见面</strong>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: '#edf2ea', color: '#5a7848', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5a7848' }}></span>
                  可发起
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                引荐已完成，现在可以给 {counterpart?.displayName ?? "对方"} 提议 2–3 个时间段和地点。
              </p>
              <div style={{ textAlign: 'right', color: '#b93e5b', fontSize: '0.9rem', fontWeight: 500 }}>
                进入安排页面 &gt;
              </div>
            </Link>
          </div>
        ) : null}
      </MatchStateHero>
    );
  } else if (hasMissingIntent) {
    hero = (
      <MatchStateHero
        variant="empty"
        title="待选择本周意向"
        body="当前这轮还没有保存可用的匹配意向。回到首页用本周参与开关确认 Friend、Date 或 Both 后，系统会按这次确认后的设置参与匹配。"
        actions={[
          { label: "返回首页选择", href: "/dashboard", variant: "primary" },
        ]}
      />
    );
  } else if (
    currentCycle?.participationStatus === "OPTED_IN" &&
    !currentCycle.intent &&
    currentCycleIsLocked
  ) {
    hero = (
      <MatchStateHero
        variant="empty"
        title="本轮已锁定"
        body="本轮报名已经截止，而且这轮没有保存可用的匹配意向，因此系统不会按本轮为你参与匹配。你仍可继续完善匹配资料，等待下一轮开放后再选择 Friend、Date 或 Both。"
        actions={[
          { label: "去完善匹配资料", href: "/dashboard/profile", variant: "secondary" },
        ]}
      />
    );
  } else if (
    currentCycle?.participationStatus === "OPTED_IN" &&
    (currentCycle.status === "OPEN" ||
      currentCycle.status === "PREPARING" ||
      currentCycle.status === "REVEAL_READY")
  ) {
    hero = (
      <MatchStateHero
        variant="waiting"
        title={hasSavedQuestionnaire ? "等待本轮揭晓" : "还没有匹配结果"}
        body={
          hasSavedQuestionnaire
            ? "你已填写匹配资料并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可在「匹配资料」中修改信息。"
            : "本轮揭晓后将在此显示匹配说明与后续操作。"
        }
        actions={[
          { label: "去完善匹配资料", href: "/dashboard/profile", variant: "secondary" },
        ]}
      />
    );
  } else if (currentCycleIsLocked) {
    hero = (
      <MatchStateHero
        variant="empty"
        title={hasSavedQuestionnaire ? "本轮已锁定" : "继续完善匹配资料"}
        body={
          hasSavedQuestionnaire
            ? "本轮报名已经截止，当前不能再参加或修改本周意向。你可以继续完善匹配资料，等待下一轮开放。"
            : "本轮报名已经截止。你仍可继续填写和完善匹配资料，为下一轮开放后的报名做准备。"
        }
        actions={[
          { label: "去完善匹配资料", href: "/dashboard/profile", variant: "primary" },
        ]}
      />
    );
  } else {
    hero = (
      <MatchStateHero
        variant="waiting"
        title={hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}
        body={
          hasSavedQuestionnaire
            ? "你已保存问卷。若尚未参加本轮，可回到首页打开本周参与开关报名；揭晓后返回此处查看结果。"
            : "请先在「匹配资料」完成问卷，然后回到首页报名参加当前轮次。"
        }
        actions={[
          { label: "返回首页", href: "/dashboard", variant: "primary" },
          { label: "去完善匹配资料", href: "/dashboard/profile", variant: "secondary" },
        ]}
      />
    );
  }

  return (
    <div className="app-page-shell app-page-shell-narrow v2-page-shell">
      <header className="v2-greeting">
        <div className="v2-greeting-main">
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.2rem' }}>你本周的匹配对象</h1>
          <p className="v2-greeting-sub" style={{ fontSize: '0.85rem', color: 'var(--fg-secondary)' }}>
            {introduced
              ? "已完成本轮引荐。联系方式已在上方展示，你也可以直接发起见面邀请。"
              : "系统已为你生成匹配对象。可先「交换联系方式」完成双方引荐，或直接发起见面邀请。"}
          </p>
        </div>
      </header>

      {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {hero}

      <div className="v2-match-secondary-actions">
        <Link
          href="/dashboard/match/history"
          className="button-ghost button-block"
        >
          查看过往匹配记录{recentMatchHistory.length > 0 ? ` (${recentMatchHistory.length}轮)` : ''}
        </Link>
        {introduced && latestMatch && !reportHandlingChipLabel(latestMatch.reportStatus) ? (
          <button
            type="button"
            className="button-ghost button-block"
            onClick={() => toggleReportForm(latestMatch.id)}
            disabled={saving === "report"}
          >
            {saving === "report" ? "处理中" : "举报本次匹配"}
          </button>
        ) : null}
      </div>

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
