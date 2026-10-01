"use client";

import { MatchReveal } from "./match-reveal";
import Link from "next/link";
import localFont from "next/font/local";

import { dcx } from "../_lib/dashboard-class-names";
import { useState, type ReactNode } from "react";
import styles from "./match-letter.module.css";
import { HeartIcon, CalendarIcon, UserCircleIcon, HomeIcon, MessageCircleIcon } from "../_components/icons";
import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import type { AuthMePayload } from "../../../lib/api";
import {
  usePageFootprint,
} from "../../../lib/product-analytics";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { MatchStateHero } from "../_components/MatchStateHero";
import { MatchWaitingStrip } from "../_components/MatchWaitingStrip";
import { ReportForm } from "../_components/ReportForm";
import { useMatchActions } from "../_components/useMatchActions";
import {
  canEditCurrentCycleParticipation,
  lastRoundUnmatched,
  reportHandlingChipLabel,
} from "../_lib/format";
import { describeRevealMoment } from "../_lib/focus";
import { useClientNow } from "../_lib/use-client-now";
import type { DashboardPayload } from "../_lib/types";

const matchNameFont = localFont({
  src: "../../../../public/fonts/long-cang.woff2",
  variable: "--font-match-name",
  display: "swap",
  weight: "400",
  preload: false,
});

export function MatchClient({
  initialNowMs,
  initialUser,
  initialDashboard,
}: {
  initialNowMs: number;
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  useDashboardSessionSeed(initialUser);

  return (
    <MatchClientView
      initialNowMs={initialNowMs}
      initialUser={initialUser}
      initialDashboard={initialDashboard}
    />
  );
}

export function MatchClientView({
  initialNowMs,
  initialUser,
  initialDashboard,
}: {
  initialNowMs: number;
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
}) {
  const nowMs = useClientNow(initialNowMs);
  const [copyStatus, setCopyStatus] = useState("");
  async function copyContact(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus("已复制"); }
    catch { setCopyStatus("复制失败，请长按联系方式复制"); }
  }

  const {
    dashboard,
    error,
    savedMessage,
    saving,
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

  const latestMatch = dashboard?.latestMatch ?? null;
  const counterpart =
    latestMatch && initialUser
      ? (latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null)
      : null;
  const revealRoundKey = dashboard?.recentMatchHistory?.find((item) => item.match?.id === latestMatch?.id)?.cycleId ?? latestMatch?.id ?? "none";
  const introduced = Boolean(latestMatch?.introducedAt);
  const publicContact =
    counterpart?.contact ??
    (counterpart?.email
      ? { label: "联络邮箱", value: counterpart.email }
      : null);
  const meetupSummary = dashboard?.meetupSummary ?? null;
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const currentCycle = dashboard?.currentCycle ?? null;
  const canEditParticipation = canEditCurrentCycleParticipation(
    currentCycle,
    nowMs,
  );
  const currentCycleIsLocked = currentCycle !== null && !canEditParticipation;
  const hasMissingIntent =
    currentCycle?.participationStatus === "OPTED_IN" &&
    !currentCycle.intent &&
    canEditParticipation;
  const matchPageFootprintRef = usePageFootprint<HTMLDivElement>(
    "match_page_viewed",
    {
      route: "/dashboard/match",
      surface: "match_page",
      onceKey: `match_page_viewed:${initialUser.id}:${latestMatch?.id ?? "none"}`,
      entityType: latestMatch ? "match" : undefined,
      entityId: latestMatch?.id,
      metadata: {
        matchId: latestMatch?.id,
        matchVisibility: dashboard?.latestMatchVisibility ?? "NONE",
        introduced,
        hasMeetupSession: Boolean(meetupSummary),
      },
    },
  );

  let hero: ReactNode = null;

  if (dashboard?.latestMatchVisibility === "LIMITED" && latestMatch) {
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
        {reportLabel ? (
          <span className={dcx("ui-badge ui-badge--neutral")}>
            {reportLabel}
          </span>
        ) : null}
      </MatchStateHero>
    );
  } else if (counterpart && latestMatch) {
    const reportLabel = reportHandlingChipLabel(latestMatch.reportStatus);
    const counterpartName = counterpart.displayName ?? "TA";
    hero = (
      <>
        <article className={`${styles.letter} ${matchNameFont.variable}`}>
          <div className={styles.nameRow}><h2>{counterpartName}</h2><span className={styles.englishNote} aria-hidden="true">A letter<br/>to you</span></div>
          <div className={styles.introduction}><p className={styles.salutation}>嗨！我是{counterpartName}。</p><p>{counterpart.introLine || "很高兴在这里认识你。"}</p></div>
          <div className={styles.facts}>
            <div><UserCircleIcon/><span>{counterpart.gender || "性别未填写"}</span></div>
            <div><CalendarIcon/><span>{counterpart.weeklyIntent ? WEEKLY_INTENT_LABELS[counterpart.weeklyIntent].subtitle : "意向未填写"}</span></div>
            <div><HeartIcon/><span>{counterpart.partnerGenders?.length ? `希望认识${counterpart.partnerGenders.join("、")}` : "期待认识你"}</span></div>
            <div><HomeIcon/><span>{counterpart.schoolName || "学校未填写"}</span></div>
          </div>
          <section className={styles.contact} aria-label="联系方式">
            <span className={styles.contactSprig} aria-hidden="true"/>
            <h3>联系方式</h3>
            {publicContact ? <div className={styles.contactContent}>
              <div className={styles.contactRow}>
                {counterpart.contact?.type === "WECHAT" ? <span className={styles.wechatIcon} aria-hidden="true"/> : <MessageCircleIcon/>}
                <span className={styles.contactLabel}>{publicContact.label}</span>
                <span className={styles.contactValue}>{publicContact.value}</span>
              </div>
              <button className={styles.primary} onClick={() => void copyContact(publicContact.value)}>复制{publicContact.label}</button>
              <p role="status" className={styles.copyStatus}>{copyStatus}</p>
            </div> : <p>联系方式暂未加载，请稍后刷新查看。</p>}
          </section>
        </article>
        <div className={styles.reportArea}><span>请尊重彼此的交流意愿</span>{reportLabel ? <span>{reportLabel}</span> : <button disabled={saving === "report"} onClick={() => toggleReportForm(latestMatch.id)}>举报本次匹配</button>}</div>
      </>
    );
  } else if (hasMissingIntent) {
    hero = (
      <MatchWaitingStrip
        eyebrow="待确认意向"
        title="待选择本周意向"
        subtitle="当前这轮还没有保存可用的匹配意向。回到首页确认 Friend / Date / Both 后即按该设置参与匹配。"
        revealLabel={describeRevealMoment(currentCycle?.revealAt ?? null)}
        revealAt={currentCycle?.revealAt ?? null}
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
      <MatchWaitingStrip
        eyebrow="已锁定"
        variant="muted"
        title="本轮已锁定"
        subtitle="本轮报名已截止，且这轮没有保存可用的匹配意向，系统不会按本轮为你参与匹配。可继续完善匹配资料，等待下一轮开放。"
        revealLabel={describeRevealMoment(currentCycle?.revealAt ?? null)}
        revealAt={currentCycle?.revealAt ?? null}
        actions={[
          {
            label: "去完善匹配资料",
            href: "/dashboard/profile",
            variant: "secondary",
          },
        ]}
      />
    );
  } else if (dashboard && lastRoundUnmatched(dashboard)) {
    const lastRevealedRound = dashboard.lastRevealedRound!;
    hero = (
      <MatchWaitingStrip
        eyebrow="未匹配"
        variant="muted"
        title="本轮未匹配到对象"
        subtitle={`「${lastRevealedRound.codename}」暂未找到合适的同学。你可以检查匹配资料，下一轮开放后回到首页重新报名。`}
        actions={[
          {
            label: "去完善匹配资料",
            href: "/dashboard/profile",
            variant: "primary",
          },
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
      <MatchWaitingStrip
        eyebrow="等待揭晓"
        title={hasSavedQuestionnaire ? "等待本轮揭晓" : "还没有匹配结果"}
        subtitle={
          hasSavedQuestionnaire
            ? "你已报名本轮匹配。结果公布后可在这里查看；匹配成功时，双方会收到邮件。"
            : "本轮揭晓后这里会显示匹配说明与后续操作。"
        }
        revealLabel={describeRevealMoment(currentCycle?.revealAt ?? null)}
        revealAt={currentCycle?.revealAt ?? null}
        actions={[
          {
            label: "去完善匹配资料",
            href: "/dashboard/profile",
            variant: "secondary",
          },
        ]}
      />
    );
  } else if (currentCycleIsLocked) {
    hero = (
      <MatchWaitingStrip
        eyebrow="已锁定"
        variant="muted"
        title={hasSavedQuestionnaire ? "本轮已锁定" : "继续完善匹配资料"}
        subtitle={
          hasSavedQuestionnaire
            ? "本轮报名已截止，当前不能再参加或修改本周意向。可继续完善匹配资料，等待下一轮开放。"
            : "本轮报名已截止。仍可继续填写完善匹配资料，为下一轮开放报名做准备。"
        }
        revealLabel={describeRevealMoment(currentCycle?.revealAt ?? null)}
        revealAt={currentCycle?.revealAt ?? null}
        actions={[
          {
            label: "去完善匹配资料",
            href: "/dashboard/profile",
            variant: "primary",
          },
        ]}
      />
    );
  } else {
    hero = (
      <MatchWaitingStrip
        eyebrow={hasSavedQuestionnaire ? "待参与" : "待完善资料"}
        title={hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}
        subtitle={
          hasSavedQuestionnaire
            ? "你已保存问卷。若尚未参加本轮，可回到首页打开本周参与开关报名；揭晓后返回此处查看结果。"
            : "请先在「匹配资料」完成问卷，然后回到首页报名参加当前轮次。"
        }
        revealLabel={describeRevealMoment(currentCycle?.revealAt ?? null)}
        revealAt={currentCycle?.revealAt ?? null}
        actions={[
          { label: "返回首页", href: "/dashboard", variant: "primary" },
          {
            label: "去完善匹配资料",
            href: "/dashboard/profile",
            variant: "secondary",
          },
        ]}
      />
    );
  }

  return (
    <div
      ref={matchPageFootprintRef}
      className={dcx("app-page-shell app-page-shell-narrow v2-page-shell")}
    >
      <MatchReveal key={`${initialUser.id}:${revealRoundKey}`} receiptKey={`${initialUser.id}:${revealRoundKey}`} enabled={Boolean(latestMatch && counterpart && dashboard?.latestMatchVisibility !== "LIMITED")}>
      <header className={styles.header}><h1>本周来信</h1><Link href="/dashboard/match/history">过往匹配记录</Link></header>

      {savedMessage ? (
        <p className={dcx("ui-form-message ui-form-message--success")}>
          {savedMessage}
        </p>
      ) : null}
      {error ? (
        <p className={dcx("ui-form-message ui-form-message--error")}>{error}</p>
      ) : null}

      {hero}

      </MatchReveal>
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
