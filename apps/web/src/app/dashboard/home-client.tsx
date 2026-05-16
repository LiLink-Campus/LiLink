"use client";

import { CONTACT_CHANNEL_LABELS } from "@lilink/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../lib/weekly-intent";
import { IntentSheet } from "./_components/IntentSheet";
import { DashboardTodoSection } from "./_components/DashboardTodoSection";
import {
  CalendarIcon,
  CheckCircleIcon,
} from "./_components/icons";
import {
  TeaTimeIllustration,
  WheatSprigIllustration,
} from "./_components/illustrations";
import { useDashboardSessionSeed } from "./_components/DashboardSessionSeed";
import { canEditCurrentCycleParticipation } from "./_lib/format";
import { profileAttentionHashForKey } from "./_lib/profile-attention";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  QuestionnaireAttentionPayload,
} from "./_lib/types";

type PrepTaskTone = "complete" | "neutral" | "warning";

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

function questionnaireAttentionHref(
  attention: QuestionnaireAttentionPayload | null,
) {
  const key = attention?.pendingKeys?.[0];
  return key
    ? `/dashboard/profile${profileAttentionHashForKey(key)}`
    : "/dashboard/profile";
}

function PrepTaskCard({
  title,
  description,
  marker,
  tone,
  actionLabel,
  href,
  disabled,
  onAction,
}: {
  title: string;
  description: string;
  marker: string;
  tone: PrepTaskTone;
  actionLabel: string;
  href?: string;
  disabled?: boolean;
  onAction?: () => void;
}) {
  const statusClassName = `weekly-prep-status is-${tone}`;
  const actionClassName = disabled
    ? "weekly-prep-action is-disabled"
    : "weekly-prep-action";

  return (
    <article className="weekly-prep-item">
      <div className={statusClassName} aria-hidden="true">
        {tone === "complete" ? <CheckCircleIcon /> : marker}
      </div>
      <div className="weekly-prep-copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {href ? (
        <Link className={actionClassName} href={href}>
          {actionLabel}
        </Link>
      ) : (
        <button
          type="button"
          className={actionClassName}
          disabled={disabled}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </article>
  );
}

export function HomeClient({
  initialUser,
  initialDashboard,
  questionnairePercent,
  questionnaireSubmitted,
  questionnaireEligibleToOptIn,
  questionnaireHasIncompleteDraft,
  questionnaireAttention,
  contactPreferences,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  questionnairePercent: number;
  questionnaireSubmitted: boolean;
  questionnaireEligibleToOptIn: boolean;
  questionnaireHasIncompleteDraft: boolean;
  questionnaireAttention: QuestionnaireAttentionPayload | null;
  contactPreferences: ContactPreferencesPayload;
}) {
  const router = useRouter();
  const lastVisibleRefreshAtRef = useRef(Date.now());
  useDashboardSessionSeed(initialUser);
  const [dashboard, setDashboard] = useState<DashboardPayload>(initialDashboard);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    setDashboard(initialDashboard);
    lastVisibleRefreshAtRef.current = Date.now();
  }, [initialDashboard]);

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
  const participationBlockedByQuestionnaire =
    Boolean(cycle) && canEdit && !isOptedIn && !questionnaireEligibleToOptIn;

  const revealLabel = formatRevealLabel(cycle?.revealAt);
  const deadlineLabel = formatDeadlineLabel(cycle?.participationDeadline);
  const pendingQuestionnaireUpdateCount =
    questionnaireAttention?.pendingUpdatedKeys?.length ?? 0;
  const missingQuestionnaireRequiredCount =
    questionnaireAttention?.missingRequiredKeys?.length ?? 0;
  const hasQuestionnaireAttention =
    (questionnaireAttention?.pendingKeys?.length ?? 0) > 0;
  const questionnaireCardHref = questionnaireAttentionHref(
    questionnaireAttention,
  );
  const hasAdditionalContactMethod = contactPreferences.methods.some(
    (method) => method.value.trim().length > 0,
  );
  const contactUsesEmail = contactPreferences.preferredContactChannel === "EMAIL";
  const contactTaskComplete = hasAdditionalContactMethod && !contactUsesEmail;
  const contactTaskDescription = contactTaskComplete
    ? `引荐后将展示${CONTACT_CHANNEL_LABELS[contactPreferences.preferredContactChannel]}。`
    : hasAdditionalContactMethod
      ? "已添加其他方式，当前仍选择展示邮箱。"
      : "引荐后将默认展示注册邮箱。";
  const questionnaireTaskComplete =
    questionnaireEligibleToOptIn && !hasQuestionnaireAttention;
  const questionnaireTaskDescription =
    pendingQuestionnaireUpdateCount > 0
      ? `有 ${pendingQuestionnaireUpdateCount} 项更新待查看。`
      : missingQuestionnaireRequiredCount > 0
        ? `还有 ${missingQuestionnaireRequiredCount} 项必填内容需要补完。`
        : questionnaireTaskComplete
          ? "已满足本轮匹配要求。"
          : questionnaireHasIncompleteDraft
            ? "草稿待补完，完成后才能参与本轮。"
            : questionnaireSubmitted
              ? `当前完成度 ${questionnairePercent}%。`
              : "先补完资料，下一轮才能认真匹配。";
  const intentTaskComplete = Boolean(isOptedIn && intentMeta);
  const intentTaskDescription = intentMeta
    ? `本周意向：${intentMeta.primary} · ${intentMeta.subtitle}`
    : !cycle
      ? "等待下一轮开放。"
      : participationBlockedByQuestionnaire
        ? "先完成匹配资料，再选择本周意向。"
        : "设置你本周想参与的匹配方向。";
  const intentActionDisabled =
    saving ||
    !cycle ||
    !canEdit ||
    (!isOptedIn && !questionnaireEligibleToOptIn);

  function setSavedMessageOnly(message: string | null) {
    setSavedMessage(message);
    setError(null);
  }

  function setErrorOnly(message: string | null) {
    setError(message);
    setSavedMessage(null);
  }

  function openIntentSheetFromTask() {
    if (!cycle) {
      setErrorOnly("当前没有开放中的轮次。");
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态或本周意向。");
      return;
    }
    if (!isOptedIn && !questionnaireEligibleToOptIn) {
      setErrorOnly(
        questionnaireHasIncompleteDraft
          ? "匹配资料有未保存的修改且必填项缺失，请补完后再参加本轮匹配。"
          : "请先完成「匹配资料」，再参加本轮匹配。",
      );
      return;
    }
    setSheetOpen(true);
  }

  async function chooseIntent(nextIntent: WeeklyIntent) {
    if (!cycle) {
      setErrorOnly("当前没有开放中的轮次。");
      setSheetOpen(false);
      return;
    }
    if (!canEdit) {
      setErrorOnly("本轮报名已锁定，不能再修改参与状态或本周意向。");
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
        `本周意向已锁定为 ${WEEKLY_INTENT_LABELS[nextIntent].primary}（${WEEKLY_INTENT_LABELS[nextIntent].subtitle}）。`,
      );
      setSheetOpen(false);
    } catch (caughtError) {
      setErrorOnly(
        caughtError instanceof Error
          ? caughtError.message
          : "本周意向保存失败。",
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
      setSavedMessageOnly("已退出本轮，意向已清空；随时可以重新加入。");
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
    if (!questionnaireEligibleToOptIn) {
      setErrorOnly(
        questionnaireHasIncompleteDraft
          ? "匹配资料有未保存的修改且必填项缺失，请补完后再参加本轮匹配。"
          : "请先完成「匹配资料」，再参加本轮匹配。",
      );
      return;
    }
    setSheetOpen(true);
  }

  const latestMatch = dashboard.latestMatch;
  const dashboardTasks = dashboard.tasks ?? [];
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;
  const matchIntroduced = Boolean(latestMatch?.introducedAt);

  return (
    <div className="app-page-shell home-dashboard">
      <header className="home-page-title">
        <h1>首页</h1>
      </header>

      {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <DashboardTodoSection tasks={dashboardTasks} />

      <section className="weekly-prep-panel" aria-label="本周准备">
        <h2>本周准备</h2>
        <div className="weekly-prep-list">
          <PrepTaskCard
            title="完成匹配资料"
            description={questionnaireTaskDescription}
            marker="1"
            tone={questionnaireTaskComplete ? "complete" : "warning"}
            actionLabel={questionnaireTaskComplete ? "查看 →" : "去完善 →"}
            href={questionnaireCardHref}
          />
          <PrepTaskCard
            title="选择本周意向"
            description={intentTaskDescription}
            marker="2"
            tone={intentTaskComplete ? "complete" : "neutral"}
            actionLabel={intentMeta ? "更换 →" : "去选择 →"}
            disabled={intentActionDisabled}
            onAction={openIntentSheetFromTask}
          />
          <PrepTaskCard
            title="设置引荐联系方式"
            description={contactTaskDescription}
            marker="!"
            tone={contactTaskComplete ? "complete" : "warning"}
            actionLabel="去设置 →"
            href="/dashboard/referral-settings"
          />
        </div>
      </section>

      <div className="home-card-grid">
        <section className="app-card home-participation-card" aria-label="本周参与">
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
          <div className="home-participation-panel">
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
                        : !questionnaireEligibleToOptIn
                          ? "暂不可参与"
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
                aria-describedby={
                  participationBlockedByQuestionnaire
                    ? "participation-blocked-hint"
                    : undefined
                }
                disabled={
                  saving ||
                  !cycle ||
                  !canEdit ||
                  (!isOptedIn && !questionnaireEligibleToOptIn)
                }
                title={
                  participationBlockedByQuestionnaire
                    ? questionnaireHasIncompleteDraft
                      ? "匹配资料有未保存的修改且必填项缺失，请补完后再参加本轮匹配"
                      : "需要先完成「匹配资料」才能参加本轮匹配"
                    : undefined
                }
                onClick={handleToggleClick}
              />
            </div>

            {participationBlockedByQuestionnaire ? (
              <div
                id="participation-blocked-hint"
                className="weekly-intent-callout"
                role="status"
              >
                <span
                  className="weekly-intent-callout-icon"
                  aria-hidden="true"
                >
                  !
                </span>
                <span>
                  {questionnaireHasIncompleteDraft
                    ? "匹配资料有未保存的修改且必填项缺失，请补完后再参加本轮匹配"
                    : "先完成「匹配资料」才能参加本轮匹配"}
                  （当前进度 {questionnairePercent}%）。
                  <Link
                    href="/dashboard/profile"
                    className="participation-blocked-link"
                  >
                    去完善 →
                  </Link>
                </span>
              </div>
            ) : null}

            {isOptedIn ? (
              <div className="participation-intent-row">
                <span>
                  本周意向：
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
                  {intentMeta ? "更换" : "选择意向"}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="app-card home-match-card" aria-label="我的匹配">
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
                  匹配度 {latestMatch.score.toFixed(1)} ·{" "}
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

      <aside className="home-tip-bar">
        <span className="home-tip-icon" aria-hidden="true">
          i
        </span>
        <p>小贴士：资料越完整，匹配越精准；花几分钟完善信息吧。</p>
      </aside>

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
