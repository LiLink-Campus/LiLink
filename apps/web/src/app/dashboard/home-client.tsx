"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import {
  weeklyIntentLabelsFor,
  type WeeklyIntent,
} from "../../lib/weekly-intent";
import type { SupportedLocale } from "@lilink/shared";
import { IntentSheet } from "./_components/IntentSheet";
import {
  CalendarIcon,
  GroupTrioIcon,
  PeopleIcon,
} from "./_components/icons";
import {
  CampusLineart,
  GrassRowIllustration,
  OliveSprigIllustration,
  TeaTimeIllustration,
  ThreeChairsIllustration,
  WheatSprigIllustration,
} from "./_components/illustrations";
import { useDashboardSessionSeed } from "./_components/DashboardSessionSeed";
import { canEditCurrentCycleParticipation } from "./_lib/format";
import type { DashboardPayload } from "./_lib/types";
import { useLocale } from "../locale-context";

type HomeMode = "ONE_ON_ONE" | "GROUP";

const HOME_VISIBLE_REFRESH_TTL_MS = 30_000;

function formatRevealLabel(
  iso: string | null | undefined,
  locale: SupportedLocale,
) {
  if (!iso) return locale === "zh-CN" ? "暂无开放轮次" : "No open round";
  const target = new Date(iso);
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  return formatter.format(target);
}

function formatDeadlineLabel(
  iso: string | null | undefined,
  locale: SupportedLocale,
) {
  if (!iso) return null;
  const target = new Date(iso);
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  return locale === "zh-CN"
    ? `本周 ${formatter.format(target)} 截止参与`
    : `Participation closes ${formatter.format(target)}`;
}

const HOME_DASHBOARD_COPY = {
  "zh-CN": {
    fallbackName: "同学",
    greeting: (name: string) => `你好，${name}`,
    submittedIntro: "本周是新的开始，期待你的相遇。",
    draftIntro: "先去「资料」补完问卷，下一轮就能为你认真匹配。",
    modeLabel: "匹配模式",
    oneOnOne: "1v1 匹配",
    group: "多人局",
    upcoming: "即将开放",
    groupAria: "多人局即将开放",
    groupBody:
      "多人匹配，更多可能。我们正在打磨多人组队的匹配算法；第一波内测开放后会通过通知告诉你。",
    participationAria: "本周参与",
    participationTitle: "本周参与",
    rules: "规则说明 →",
    nextRound: "等待下一轮开放",
    noCycle: "本轮未开放",
    lockedJoined: "本轮已锁定·参与中",
    locked: "本轮已锁定",
    joined: "参与中",
    notJoined: "未参与",
    reveal: (label: string) => `匹配将于 ${label} 开启`,
    leaveAria: "退出本轮",
    joinAria: "参加本轮",
    weeklyIntent: "本周意图：",
    pendingIntent: "待确认",
    change: "更换",
    chooseIntent: "选择意图",
    profileAria: "问卷进度",
    profileTitle: "问卷进度",
    continueProfile: "继续完善 →",
    completed: "已完成",
    draft: "草稿进度",
    progressAria: "问卷完成度",
    progressNote: "完成度越高，匹配越准确。",
    matchAria: "我的匹配",
    matchTitle: "我的匹配",
    viewAll: "查看全部 →",
    limitedTitle: "本轮匹配已受限",
    limitedBody: "对方信息已隐藏；点查看全部了解原因和后续操作。",
    matchedTo: (name: string) => `本周为你匹配到 ${name}`,
    ta: "TA",
    score: "匹配度",
    introduced: "已引荐",
    waitingIntro: "等待你引荐对方",
    lastUnmatchedTitle: "上一轮未匹配到对象",
    lastUnmatchedBody: "本轮报名后，揭晓时再为你尝试一次。",
    noMatchTitle: "本周暂无匹配结果",
    noMatchBody: (label: string) => `请耐心等待 ${label} 的开启。`,
    moreAria: "更多功能",
    moreTitle: "更多功能",
    moreBody: "更多模块在路上。",
    noOpenCycle: "当前没有开放中的轮次。",
    lockedParticipation: "本轮报名已锁定，不能再修改参与状态。",
    lockedIntent: "本轮报名已锁定，不能再修改参与状态或本周意图。",
    savedIntent: (primary: string, subtitle: string) =>
      `本周意图已锁定为 ${primary}（${subtitle}）。`,
    saveIntentFailed: "本周意图保存失败。",
    withdrawn: "已退出本轮，意图已清空；随时可以重新加入。",
    withdrawFailed: "退出本轮失败。",
    grass: "好的关系，源于尊重与真诚",
  },
  "en-US": {
    fallbackName: "there",
    greeting: (name: string) => `Hi, ${name}`,
    submittedIntro: "A new week is open. Your next meeting starts here.",
    draftIntro:
      "Finish your questionnaire in Profile so the next round can match you carefully.",
    modeLabel: "Matching mode",
    oneOnOne: "1v1 Match",
    group: "Group Match",
    upcoming: "Coming soon",
    groupAria: "Group match coming soon",
    groupBody:
      "Group matching means more possibilities. The algorithm is still being refined; we will notify you when the first test opens.",
    participationAria: "Weekly participation",
    participationTitle: "Weekly participation",
    rules: "Rules →",
    nextRound: "Waiting for the next round",
    noCycle: "No open round",
    lockedJoined: "Locked · joined",
    locked: "Round locked",
    joined: "Joined",
    notJoined: "Not joined",
    reveal: (label: string) => `Matching opens at ${label}`,
    leaveAria: "Leave this round",
    joinAria: "Join this round",
    weeklyIntent: "Weekly intent: ",
    pendingIntent: "Not chosen",
    change: "Change",
    chooseIntent: "Choose intent",
    profileAria: "Questionnaire progress",
    profileTitle: "Questionnaire progress",
    continueProfile: "Continue →",
    completed: "Completed",
    draft: "Draft progress",
    progressAria: "Questionnaire completion",
    progressNote: "More complete answers improve match accuracy.",
    matchAria: "My match",
    matchTitle: "My match",
    viewAll: "View all →",
    limitedTitle: "This match is limited",
    limitedBody: "The other person's information is hidden. View all for details.",
    matchedTo: (name: string) => `Matched with ${name} this week`,
    ta: "them",
    score: "Score",
    introduced: "Introduced",
    waitingIntro: "Waiting for your contact request",
    lastUnmatchedTitle: "No match in the previous round",
    lastUnmatchedBody: "Join this round and LiLink will try again at reveal.",
    noMatchTitle: "No match result yet",
    noMatchBody: (label: string) => `Please wait until ${label}.`,
    moreAria: "More features",
    moreTitle: "More features",
    moreBody: "More modules are on the way.",
    noOpenCycle: "There is no open round right now.",
    lockedParticipation: "This round is locked, so participation cannot change.",
    lockedIntent:
      "This round is locked, so participation and weekly intent cannot change.",
    savedIntent: (primary: string, subtitle: string) =>
      `Weekly intent locked as ${primary} (${subtitle}).`,
    saveIntentFailed: "Weekly intent could not be saved.",
    withdrawn: "You have left this round and your intent was cleared.",
    withdrawFailed: "Could not leave this round.",
    grass: "Good relationships start with respect and sincerity",
  },
} as const;

export function HomeClient({
  initialUser,
  initialDashboard,
  questionnairePercent,
  questionnaireSubmitted,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  questionnairePercent: number;
  questionnaireSubmitted: boolean;
}) {
  const { locale } = useLocale();
  const copy = HOME_DASHBOARD_COPY[locale];
  const router = useRouter();
  const lastVisibleRefreshAtRef = useRef(Date.now());
  useDashboardSessionSeed(initialUser);
  const [dashboard, setDashboard] = useState<DashboardPayload>(initialDashboard);
  const [mode, setMode] = useState<HomeMode>("ONE_ON_ONE");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setDashboard(initialDashboard);
    lastVisibleRefreshAtRef.current = Date.now();
  }, [initialDashboard]);

  // The dashboard summary (questionnaire progress, latest match, current
  // cycle) is rendered server-side. When the user comes back from another
  // tab/page (e.g. after editing the questionnaire), refresh the RSC tree so
  // the percentage and match preview reflect the latest server state.
  useEffect(() => {
    function refreshIfStale() {
      const now = Date.now();
      if (now - lastVisibleRefreshAtRef.current < HOME_VISIBLE_REFRESH_TTL_MS) {
        return;
      }

      lastVisibleRefreshAtRef.current = now;
      router.refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshIfStale();
      }
    }
    function handleFocus() {
      refreshIfStale();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [router]);

  const cycle = dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle);
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const intent = cycle?.intent ?? null;
  const intentMeta = intent ? weeklyIntentLabelsFor(intent, locale) : null;

  const greeting =
    initialUser.displayName?.trim() ||
    initialUser.email.split("@")[0] ||
    copy.fallbackName;

  const revealLabel = formatRevealLabel(cycle?.revealAt, locale);
  const deadlineLabel = formatDeadlineLabel(cycle?.participationDeadline, locale);

  function setSavedMessageOnly(message: string | null) {
    setSavedMessage(message);
    setError(null);
  }

  function setErrorOnly(message: string | null) {
    setError(message);
    setSavedMessage(null);
  }

  async function chooseIntent(nextIntent: WeeklyIntent) {
    if (!cycle) {
      setErrorOnly(copy.noOpenCycle);
      setSheetOpen(false);
      return;
    }
    if (!canEdit) {
      setErrorOnly(copy.lockedIntent);
      setSheetOpen(false);
      return;
    }

    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: true, intent: nextIntent }),
      });
      setDashboard((current) =>
        current.currentCycle
          ? {
              ...current,
              currentCycle: {
                ...current.currentCycle,
                participationStatus: "OPTED_IN",
                intent: nextIntent,
              },
            }
          : current,
      );
      setSavedMessageOnly(
        copy.savedIntent(
          weeklyIntentLabelsFor(nextIntent, locale).primary,
          weeklyIntentLabelsFor(nextIntent, locale).subtitle,
        ),
      );
      setSheetOpen(false);
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error
          ? caughtError.message
          : copy.saveIntentFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!cycle) return;
    if (!canEdit) {
      setErrorOnly(copy.lockedParticipation);
      return;
    }

    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi("/me/participation", {
        method: "PUT",
        body: JSON.stringify({ optIn: false }),
      });
      setDashboard((current) =>
        current.currentCycle
          ? {
              ...current,
              currentCycle: {
                ...current.currentCycle,
                participationStatus: "OPTED_OUT",
                intent: null,
              },
            }
          : current,
      );
      setSavedMessageOnly(copy.withdrawn);
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error ? caughtError.message : copy.withdrawFailed,
      );
    } finally {
      setSaving(false);
    }
  }

  function handleToggleClick() {
    if (!cycle) {
      setErrorOnly(copy.noOpenCycle);
      return;
    }
    if (!canEdit) {
      setErrorOnly(copy.lockedParticipation);
      return;
    }
    if (isOptedIn) {
      void withdraw();
      return;
    }
    setSheetOpen(true);
  }

  const latestMatch = dashboard.latestMatch;
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;
  const matchIntroduced = Boolean(latestMatch?.introducedAt);

  return (
    <div className="app-page-shell">
      <section className="hub-greeting">
        <h1>
          {copy.greeting(greeting)}
          <OliveSprigIllustration className="olive-sprig" />
        </h1>
        <p>
          {questionnaireSubmitted
            ? copy.submittedIntro
            : copy.draftIntro}
        </p>
      </section>

      <nav className="mode-tabs" aria-label={copy.modeLabel}>
        <button
          type="button"
          className={mode === "ONE_ON_ONE" ? "mode-tab is-active" : "mode-tab"}
          aria-pressed={mode === "ONE_ON_ONE"}
          onClick={() => setMode("ONE_ON_ONE")}
        >
          <PeopleIcon />
          <span>{copy.oneOnOne}</span>
        </button>
        <button
          type="button"
          className={mode === "GROUP" ? "mode-tab is-active" : "mode-tab"}
          aria-pressed={mode === "GROUP"}
          onClick={() => setMode("GROUP")}
        >
          <GroupTrioIcon />
          <span>{copy.group}</span>
          <span className="mode-tab-badge">{copy.upcoming}</span>
        </button>
      </nav>

      {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {mode === "GROUP" ? (
        <section className="coming-soon-card" aria-label={copy.groupAria}>
          <ThreeChairsIllustration className="coming-soon-illustration" />
          <span className="coming-soon-meta">{copy.upcoming}</span>
          <h3>{copy.group}</h3>
          <p>{copy.groupBody}</p>
        </section>
      ) : (
        <>
        <div className="app-card-grid">
          <section className="app-card" aria-label={copy.participationAria}>
            <div className="app-card-head">
              <h2 className="app-card-title">{copy.participationTitle}</h2>
              <Link href="/about" className="app-card-link">
                {copy.rules}
              </Link>
            </div>
            <span className="participation-meta">
              <CalendarIcon />
              {deadlineLabel ?? copy.nextRound}
            </span>
            <div className="participation-row">
              <div className="participation-state">
                <strong>
                  {!cycle
                    ? copy.noCycle
                    : !canEdit
                      ? isOptedIn
                        ? copy.lockedJoined
                        : copy.locked
                      : isOptedIn
                        ? copy.joined
                        : copy.notJoined}
                </strong>
                <span>{copy.reveal(revealLabel)}</span>
              </div>
              <button
                type="button"
                className={
                  isOptedIn
                    ? "participation-toggle is-on"
                    : "participation-toggle"
                }
                aria-pressed={isOptedIn}
                aria-label={isOptedIn ? copy.leaveAria : copy.joinAria}
                disabled={saving || !cycle || !canEdit}
                onClick={handleToggleClick}
              />
            </div>
            {isOptedIn ? (
              <div className="participation-intent-row">
                <span>
                  {copy.weeklyIntent}
                  <strong>
                    {intentMeta
                      ? `${intentMeta.primary} · ${intentMeta.subtitle}`
                      : copy.pendingIntent}
                  </strong>
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving || !canEdit}
                  onClick={() => setSheetOpen(true)}
                >
                  {intentMeta ? copy.change : copy.chooseIntent}
                </button>
              </div>
            ) : null}
          </section>

          <section className="app-card" aria-label={copy.profileAria}>
            <div className="app-card-head">
              <h2 className="app-card-title">{copy.profileTitle}</h2>
              <Link href="/dashboard/profile" className="app-card-link">
                {copy.continueProfile}
              </Link>
            </div>
            <div className="q-progress-row">
              <span className="app-muted">
                {questionnaireSubmitted ? copy.completed : copy.draft}
              </span>
              <strong>{questionnairePercent}%</strong>
            </div>
            <div
              className="q-progress-bar"
              role="progressbar"
              aria-valuenow={questionnairePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={copy.progressAria}
            >
              <div style={{ width: `${questionnairePercent}%` }} />
            </div>
            <p className="q-progress-note">{copy.progressNote}</p>
          </section>

          <section className="app-card grid-span-all" aria-label={copy.matchAria}>
            <div className="app-card-head">
              <h2 className="app-card-title">{copy.matchTitle}</h2>
              <Link href="/dashboard/match" className="app-card-link">
                {copy.viewAll}
              </Link>
            </div>
            {dashboard.latestMatchVisibility === "LIMITED" && latestMatch ? (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>{copy.limitedTitle}</strong>
                  <span>{copy.limitedBody}</span>
                </div>
              </div>
            ) : counterpart && latestMatch ? (
              <div className="match-preview">
                <WheatSprigIllustration className="match-preview-illustration" />
                <div className="match-preview-body">
                  <p className="match-preview-title">
                    {copy.matchedTo(
                      matchIntroduced
                        ? counterpart.displayName ?? copy.ta
                        : copy.ta,
                    )}
                  </p>
                  <p className="match-preview-sub">
                    {copy.score} {latestMatch.score.toFixed(1)} ·{" "}
                    {matchIntroduced ? copy.introduced : copy.waitingIntro}
                  </p>
                </div>
              </div>
            ) : dashboard.lastRevealedRound?.participationStatus === "OPTED_IN" &&
              !dashboard.lastRevealedRound.matched ? (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>{copy.lastUnmatchedTitle}</strong>
                  <span>{copy.lastUnmatchedBody}</span>
                </div>
              </div>
            ) : (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>{copy.noMatchTitle}</strong>
                  <span>{copy.noMatchBody(revealLabel)}</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="coming-soon-card" aria-label={copy.moreAria}>
          <CampusLineart className="coming-soon-illustration coming-soon-illustration-wide" />
          <span className="coming-soon-meta">{copy.upcoming}</span>
          <h3>{copy.moreTitle}</h3>
          <p>{copy.moreBody}</p>
        </section>
        </>
      )}

      <div className="hub-grass-divider" aria-hidden="true">
        <GrassRowIllustration />
        <span>{copy.grass}</span>
        <GrassRowIllustration />
      </div>

      <IntentSheet
        open={sheetOpen}
        saving={saving}
        currentIntent={intent}
        onChoose={(nextIntent) => void chooseIntent(nextIntent)}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
