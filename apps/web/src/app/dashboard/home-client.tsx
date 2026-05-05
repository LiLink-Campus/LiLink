"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../lib/weekly-intent";
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

type HomeMode = "ONE_ON_ONE" | "GROUP";

const HOME_VISIBLE_REFRESH_TTL_MS = 30_000;

function formatRevealLabel(iso: string | null | undefined) {
  if (!iso) return "暂无开放轮次";
  const target = new Date(iso);
  const formatter = new Intl.DateTimeFormat("zh-CN", {
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

function formatDeadlineLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const target = new Date(iso);
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  return `本周 ${formatter.format(target)} 截止参与`;
}

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
  const intentMeta = intent ? WEEKLY_INTENT_LABELS[intent] : null;

  const greeting =
    initialUser.displayName?.trim() ||
    initialUser.email.split("@")[0] ||
    "同学";

  const revealLabel = formatRevealLabel(cycle?.revealAt);
  const deadlineLabel = formatDeadlineLabel(cycle?.participationDeadline);

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
      setErrorOnly("当前没有开放中的轮次。");
      setSheetOpen(false);
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态或本周意图。");
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
        `本周意图已锁定为 ${WEEKLY_INTENT_LABELS[nextIntent].primary}（${WEEKLY_INTENT_LABELS[nextIntent].subtitle}）。`,
      );
      setSheetOpen(false);
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error
          ? caughtError.message
          : "本周意图保存失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!cycle) return;
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态。");
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
      setSavedMessageOnly("已退出本轮，意图已清空；随时可以重新加入。");
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error ? caughtError.message : "退出本轮失败。",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleToggleClick() {
    if (!cycle) {
      setErrorOnly("当前没有开放中的轮次。");
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态。");
      return;
    }
    if (isOptedIn) {
      void withdraw();
      return;
    }
    if (!questionnaireSubmitted) {
      setErrorOnly("请先完成「资料」中的问卷，再参加本轮匹配。");
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
          你好，{greeting}
          <OliveSprigIllustration className="olive-sprig" />
        </h1>
        <p>
          {questionnaireSubmitted
            ? "本周是新的开始，期待你的相遇。"
            : "先去「资料」补完问卷，下一轮就能为你认真匹配。"}
        </p>
      </section>

      <nav className="mode-tabs" aria-label="匹配模式">
        <button
          type="button"
          className={mode === "ONE_ON_ONE" ? "mode-tab is-active" : "mode-tab"}
          aria-pressed={mode === "ONE_ON_ONE"}
          onClick={() => setMode("ONE_ON_ONE")}
        >
          <PeopleIcon />
          <span>1v1 匹配</span>
        </button>
        <button
          type="button"
          className={mode === "GROUP" ? "mode-tab is-active" : "mode-tab"}
          aria-pressed={mode === "GROUP"}
          onClick={() => setMode("GROUP")}
        >
          <GroupTrioIcon />
          <span>多人局</span>
          <span className="mode-tab-badge">即将开放</span>
        </button>
      </nav>

      {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {mode === "GROUP" ? (
        <section className="coming-soon-card" aria-label="多人局即将开放">
          <ThreeChairsIllustration className="coming-soon-illustration" />
          <span className="coming-soon-meta">即将开放</span>
          <h3>多人局</h3>
          <p>
            多人匹配，更多可能。我们正在打磨多人组队的匹配算法；第一波内测开放后会通过通知告诉你。
          </p>
        </section>
      ) : (
        <>
        <div className="app-card-grid">
          <section className="app-card" aria-label="本周参与">
            <div className="app-card-head">
              <h2 className="app-card-title">本周参与</h2>
              <Link href="/about" className="app-card-link">
                规则说明 →
              </Link>
            </div>
            <span className="participation-meta">
              <CalendarIcon />
              {deadlineLabel ?? "等待下一轮开放"}
            </span>
            <div className="participation-row">
              <div className="participation-state">
                <strong>
                  {!cycle
                    ? "本轮未开放"
                    : !canEdit
                      ? isOptedIn
                        ? "本轮已锁定·参与中"
                        : "本轮已锁定"
                      : isOptedIn
                        ? "参与中"
                        : "未参与"}
                </strong>
                <span>匹配将于 {revealLabel} 开启</span>
              </div>
              <button
                type="button"
                className={
                  isOptedIn
                    ? "participation-toggle is-on"
                    : "participation-toggle"
                }
                aria-pressed={isOptedIn}
                aria-label={isOptedIn ? "退出本轮" : "参加本轮"}
                disabled={
                  saving ||
                  !cycle ||
                  !canEdit ||
                  (!isOptedIn && !questionnaireSubmitted)
                }
                title={
                  !isOptedIn && !questionnaireSubmitted
                    ? "请先在「资料」中完成问卷"
                    : undefined
                }
                onClick={handleToggleClick}
              />
            </div>
            {isOptedIn ? (
              <div className="participation-intent-row">
                <span>
                  本周意图：
                  <strong>
                    {intentMeta
                      ? `${intentMeta.primary} · ${intentMeta.subtitle}`
                      : "待确认"}
                  </strong>
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={saving || !canEdit}
                  onClick={() => setSheetOpen(true)}
                >
                  {intentMeta ? "更换" : "选择意图"}
                </button>
              </div>
            ) : null}
          </section>

          <section className="app-card" aria-label="问卷进度">
            <div className="app-card-head">
              <h2 className="app-card-title">问卷进度</h2>
              <Link href="/dashboard/profile" className="app-card-link">
                继续完善 →
              </Link>
            </div>
            <div className="q-progress-row">
              <span className="app-muted">
                {questionnaireSubmitted ? "已完成" : "草稿进度"}
              </span>
              <strong>{questionnairePercent}%</strong>
            </div>
            <div
              className="q-progress-bar"
              role="progressbar"
              aria-valuenow={questionnairePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="问卷完成度"
            >
              <div style={{ width: `${questionnairePercent}%` }} />
            </div>
            <p className="q-progress-note">完成度越高，匹配越准确。</p>
          </section>

          <section className="app-card grid-span-all" aria-label="我的匹配">
            <div className="app-card-head">
              <h2 className="app-card-title">我的匹配</h2>
              <Link href="/dashboard/match" className="app-card-link">
                查看全部 →
              </Link>
            </div>
            {dashboard.latestMatchVisibility === "LIMITED" && latestMatch ? (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>本轮匹配已受限</strong>
                  <span>对方信息已隐藏；点查看全部了解原因和后续操作。</span>
                </div>
              </div>
            ) : counterpart && latestMatch ? (
              <div className="match-preview">
                <WheatSprigIllustration className="match-preview-illustration" />
                <div className="match-preview-body">
                  <p className="match-preview-title">
                    本周为你匹配到{" "}
                    {matchIntroduced ? counterpart.displayName ?? "TA" : "TA"}
                  </p>
                  <p className="match-preview-sub">
                    匹配度 {latestMatch.score.toFixed(1)} · {" "}
                    {matchIntroduced ? "已引荐" : "等待你引荐对方"}
                  </p>
                </div>
              </div>
            ) : dashboard.lastRevealedRound?.participationStatus === "OPTED_IN" &&
              !dashboard.lastRevealedRound.matched ? (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>上一轮未匹配到对象</strong>
                  <span>本轮报名后，揭晓时再为你尝试一次。</span>
                </div>
              </div>
            ) : (
              <div className="match-empty">
                <TeaTimeIllustration className="match-empty-illustration" />
                <div className="match-empty-body">
                  <strong>本周暂无匹配结果</strong>
                  <span>请耐心等待 {revealLabel} 的开启。</span>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="coming-soon-card" aria-label="更多功能">
          <CampusLineart className="coming-soon-illustration coming-soon-illustration-wide" />
          <span className="coming-soon-meta">即将开放</span>
          <h3>更多功能</h3>
          <p>更多模块在路上。</p>
        </section>
        </>
      )}

      <div className="hub-grass-divider" aria-hidden="true">
        <GrassRowIllustration />
        <span>好的关系，源于尊重与真诚</span>
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
