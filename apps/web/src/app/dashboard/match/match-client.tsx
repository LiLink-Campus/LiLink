"use client";

import Image from "next/image";
import { ParticipationStrip } from "./participation-strip";
import Link from "next/link";

import { dcx } from "../_lib/dashboard-class-names";
import { useState, type ReactNode } from "react";
import styles from "./match-letter.module.css";
import desktop from "./match-desktop.module.css";
import { MatchHistoryList } from "../_components/MatchHistoryList";
import { HeartIcon, CalendarIcon, UserCircleIcon, HomeIcon, MessageCircleIcon } from "../_components/icons";
import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import type { AuthMePayload } from "../../../lib/api";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { MatchStateHero } from "../_components/MatchStateHero";
import { ReportForm } from "../_components/ReportForm";
import { useMatchActions } from "../_components/useMatchActions";
import {
  lastRoundUnmatched,
  reportHandlingChipLabel,
} from "../_lib/format";
import { useClientNow } from "../_lib/use-client-now";
import type { DashboardPayload } from "../_lib/types";

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
  const [openedMatchId, setOpenedMatchId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  async function copyContact(value: string) {
    try { await navigator.clipboard.writeText(value); setCopyStatus("已复制"); }
    catch { setCopyStatus("复制失败，请长按联系方式复制"); }
  }

  const {
    dashboard,
    refreshDashboard,
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
    reportFormIsOpenForMatch,
  } = useMatchActions({
    initialDashboard,
  });

  const latestMatch = dashboard?.latestMatch ?? null;
  const counterpart =
    latestMatch && initialUser
      ? (latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null)
      : null;
  const publicContact = latestMatch?.introducedAt
    ? counterpart?.contact ??
      (counterpart?.email
        ? { label: "联络邮箱", value: counterpart.email }
        : null)
    : null;
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const currentCycle = dashboard?.currentCycle ?? null;
  let hero: ReactNode = null;

  if (dashboard?.latestMatchVisibility === "LIMITED" && latestMatch) {
    const reportLabel = reportHandlingChipLabel(latestMatch.reportStatus);
    hero = (
      <MatchStateHero
        variant="limited"
        title="上一轮匹配已受限"
        subtitle="对方的可识别信息已隐藏"
        score={latestMatch.score}
        body={
          dashboard.latestMatchLimitedReason === "ACCOUNT_DEACTIVATED"
            ? "对方已注销账号，不再展示相关资料与联系方式。"
            : dashboard.latestMatchLimitedReason === "REPORTED"
            ? "你已举报上一轮匹配对象，对方的可识别信息已被隐藏，系统已将该对象从你后续轮次中隔离。"
            : "你与上一轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。"
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
        <article className={styles.letter}>
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
            </div> : <p>对方暂无可公开的联系方式。</p>}
          </section>
        </article>
        <div className={styles.reportArea}><span>请尊重彼此的交流意愿</span>{reportLabel ? <span>{reportLabel}</span> : <button disabled={saving === "report"} onClick={() => toggleReportForm(latestMatch.id)}>举报本次匹配</button>}</div>
      </>
    );
  }

  return (
    <div
      className={`${dcx("app-page-shell app-page-shell-narrow v2-page-shell")} ${desktop.page}`}
    >
      <header className={desktop.heading}><h1>我的匹配</h1><Link href="/dashboard/match/history">过往记录 →</Link></header>
      <div className={desktop.layout}>
        <div className={desktop.current}>
          <ParticipationStrip key={currentCycle?.id ?? "none"} cycle={currentCycle} submitted={hasSavedQuestionnaire} nowMs={nowMs} onRefresh={refreshDashboard} />
          {savedMessage && <p role="status">{savedMessage}</p>}
          {error && <p role="alert">{error}</p>}
          <div className={desktop.currentHeading}><span>{dashboard?.lastRevealedRound ? `上一轮结果 · ${dashboard.lastRevealedRound.codename}` : "上一轮结果 · 暂无来信"}</span></div>
          {latestMatch && (openedMatchId === latestMatch.id || dashboard?.latestMatchVisibility === "LIMITED") ? <div className={desktop.result}>
            {dashboard?.latestMatchVisibility !== "LIMITED" && <button className={desktop.back} onClick={() => setOpenedMatchId(null)}>← 收起来信</button>}
            {hero}
          </div> : <section className={desktop.welcome} aria-label="上一轮匹配结果">
            <div className={desktop.artwork}><Image className={desktop.art} src="/images/match-letter-handwritten.png" width={1024} height={1024} alt="花枝环绕着一封等待打开的来信" priority sizes="(max-width: 879px) 85vw, 440px" /></div>
            <div className={desktop.welcomeCopy}>
              <h2>{counterpart ? "有一位同学，想认识你" : dashboard && lastRoundUnmatched(dashboard) ? "合拍的人，值得再等一等" : dashboard?.lastRevealedRound?.participationStatus === "OPTED_OUT" ? "上一轮，你暂未参与" : "下一封来信，值得期待"}</h2>
              <p>{counterpart ? "上一轮已匹配成功，去看看这封来信吧。" : dashboard && lastRoundUnmatched(dashboard) ? "上一轮暂未找到合适的同学。本轮参与状态可在上方确认。" : "这里会保留最近一轮的结果。准备好后，在上方确认参与新一轮相遇。"}</p>
              {counterpart && latestMatch ? <button onClick={() => setOpenedMatchId(latestMatch.id)}>查看上一轮结果 →</button> : !hasSavedQuestionnaire ? <Link href="/dashboard/profile">去完善匹配资料 →</Link> : null}
            </div>
          </section>}
        </div>
      <aside className={desktop.history} aria-label="过往匹配">
        <header><h2>过往匹配记录</h2><span>最近 {(dashboard?.recentMatchHistory ?? []).length} 轮</span></header>
        <p className={desktop.historyIntro}>留下每一次相遇的记录。</p>
        <MatchHistoryList desktopCards history={dashboard?.recentMatchHistory ?? []} currentUserId={initialUser.id} saving={saving} reportFormIsOpenForMatch={reportFormIsOpenForMatch} onToggleReport={toggleReportForm} />
      </aside>
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
