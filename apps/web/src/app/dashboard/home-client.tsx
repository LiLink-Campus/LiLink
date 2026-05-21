"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import {
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "../../lib/weekly-intent";
import { FocusCard, type FocusCardProps } from "./_components/FocusCard";
import { SuggestionList } from "./_components/SuggestionList";
import { IntentSheet } from "./_components/IntentSheet";
import {
  CircleIcon,
  CalendarIcon,
  ClockIcon,
  SparklesIcon,
  ClipboardIcon,
  HeartIcon,
  ProfileIcon,
} from "./_components/icons";
import { OliveSprigIllustration } from "./_components/illustrations";
import { useDashboardSessionSeed } from "./_components/DashboardSessionSeed";
import {
  describeDaysUntilLabel,
  describeDeadlineLabel,
  describeRelativeUntil,
  describeRevealMoment,
  resolveFocus,
  type FocusContext,
} from "./_lib/focus";
import { resolveSuggestions } from "./_lib/suggestions";
import { canEditCurrentCycleParticipation } from "./_lib/format";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  QuestionnaireAttentionPayload,
} from "./_lib/types";

const HOME_VISIBLE_REFRESH_TTL_MS = 30_000;

function focusCardPropsFor(
  focus: FocusContext,
  args: {
    onOpenIntentSheet: () => void;
    onWithdraw: () => void;
    saving: boolean;
    counterpartDisplayName: string | null;
    latestMatchVisibility: DashboardPayload["latestMatchVisibility"];
    latestMatchLimitedReason: DashboardPayload["latestMatchLimitedReason"];
  },
): FocusCardProps {
  switch (focus.kind) {
    case "MEETUP_NEEDS_ACTION":
      return {
        eyebrow: "轮到你",
        title: "回应 TA 的见面提议",
        body: "对方发来了几个时间和地点选项，去看看有没有合适的吧。",
        actions: [
          { label: "去回应", href: focus.task.href, variant: "primary" },
        ],
        tone: "attention",
        icon: <CalendarIcon />,
      };
    case "MEETUP_WAITING":
      return {
        eyebrow: "等待中",
        title: "已把提议发给 TA",
        body: "对方回应后，这里会立刻通知你。",
        actions: [
          { label: "查看提议", href: focus.task.href, variant: "secondary" },
        ],
        tone: "waiting",
        icon: <ClockIcon />,
      };
    case "MATCH_INTRODUCED_NO_MEETUP": {
      if (args.latestMatchVisibility === "LIMITED") {
        return {
          eyebrow: "已受限",
          title: "本轮匹配已受限",
          body:
            args.latestMatchLimitedReason === "REPORTED"
              ? "你已举报本轮匹配对象，对方的可识别信息已隐藏，系统已将该对象从你后续轮次中隔离。"
              : "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已隐藏。",
          actions: [
            {
              label: "查看匹配状态",
              href: "/dashboard/match",
              variant: "secondary",
            },
          ],
          tone: "waiting",
          icon: <ClockIcon />,
        };
      }
      const name = args.counterpartDisplayName ?? "TA";
      return {
        eyebrow: "已引荐",
        title: `可以约 ${name} 见面了`,
        body: "引荐邮件已经发出。你可以直接给对方提议 2-3 个时间和地点。",
        actions: [
          {
            label: "安排见面",
            href: `/dashboard/meetup/start?matchId=${encodeURIComponent(focus.matchId)}`,
            variant: "primary",
          },
          { label: "看看 TA 的名片", href: "/dashboard/match", variant: "link" },
        ],
        tone: "celebrate",
        icon: <SparklesIcon />,
      };
    }
    case "MATCH_REVEALED_AWAITING_INTRO":
      return {
        eyebrow: "已揭晓",
        title: "本轮为你匹配到了 TA",
        body: "你可以选择交换联系方式，或者直接发起第一次见面。",
        meta: [
          { label: "匹配度", value: `${focus.match.score.toFixed(1)} / 100` },
        ],
        actions: [
          { label: "查看匹配详情", href: "/dashboard/match", variant: "primary" },
        ],
        tone: "attention",
        icon: <SparklesIcon />,
      };
    case "QUESTIONNAIRE_ATTENTION": {
      const summary =
        focus.missingCount > 0
          ? `还有 ${focus.missingCount} 项必填内容需要补完`
          : `有 ${focus.pendingCount} 项题目有更新待你查看`;
      return {
        eyebrow: "需要处理",
        title: summary,
        body: "处理后才能参与本轮匹配。",
        actions: [
          { label: "去处理", href: focus.href, variant: "primary" },
        ],
        tone: "attention",
        icon: <ClipboardIcon />,
      };
    }
    case "QUESTIONNAIRE_INCOMPLETE":
      return {
        eyebrow: "进行中",
        title: focus.submitted ? "继续完善匹配资料" : "先完成匹配资料",
        body: "填完资料就能参加本轮匹配。系统会根据这些信息为你寻找相容的人。",
        progress: { label: "当前完成度", percent: focus.percent },
        actions: [
          { label: "继续填写", href: focus.href, variant: "primary" },
        ],
        tone: "default",
        icon: <ClipboardIcon />,
      };
    case "INTENT_REQUIRED": {
      const revealLabel = describeRevealMoment(focus.revealAt);
      const deadlineLabel = describeDeadlineLabel(focus.deadlineIso);
      return {
        eyebrow: "本周参与",
        title: "选择本周意向",
        body: "Friend / Date / Both，选定即报名成功。",
        meta: [
          ...(revealLabel
            ? [{ label: "揭晓时间", value: revealLabel }]
            : []),
          ...(deadlineLabel
            ? [{ label: "报名截止", value: deadlineLabel }]
            : []),
        ],
        actions: [
          {
            label: args.saving ? "保存中" : "选择本周意向",
            onClick: args.onOpenIntentSheet,
            variant: "primary",
            disabled: args.saving,
            loading: args.saving,
          },
        ],
        tone: "attention",
        icon: <HeartIcon />,
      };
    }
    case "OPTED_IN_AWAITING_REVEAL": {
      const revealLabel = describeRevealMoment(focus.revealAt);
      const relative = describeRelativeUntil(focus.revealAt);
      return {
        eyebrow: "已加入",
        title: `已锁定 ${focus.intentLabel}`,
        body: revealLabel
          ? `将于 ${revealLabel} 揭晓${relative ? `（${relative}）` : ""}。`
          : "等待揭晓中。",
        actions: [
          {
            label: args.saving ? "更新中" : "更换意向",
            onClick: args.onOpenIntentSheet,
            variant: "secondary",
            disabled: args.saving,
            loading: args.saving,
          },
          {
            label: args.saving ? "取消中" : "取消参与",
            onClick: args.onWithdraw,
            variant: "link",
            disabled: args.saving,
          },
        ],
        tone: "waiting",
        icon: <ClockIcon />,
      };
    }
    case "LAST_ROUND_UNMATCHED": {
      const nextRevealLabel = describeRevealMoment(focus.nextRevealAt);
      return {
        eyebrow: "上一轮",
        title: "未匹配成功",
        body: `「${focus.codename}」轮中没有与你强相容的组合。下一轮重新加入即可再试一次。`,
        actions: [
          nextRevealLabel
            ? {
                label: "选择本周意向",
                onClick: args.onOpenIntentSheet,
                variant: "primary",
                disabled: args.saving,
              }
            : {
                label: "去完善资料",
                href: "/dashboard/profile",
                variant: "primary",
              },
        ],
        tone: "default",
        icon: <CircleIcon />,
      };
    }
    case "CYCLE_LOCKED": {
      const revealLabel = describeRevealMoment(focus.revealAt);
      return {
        eyebrow: "已锁定",
        title: "本轮报名已截止",
        body: revealLabel
          ? `「${focus.codename}」将于 ${revealLabel} 揭晓。`
          : `「${focus.codename}」等待揭晓中。`,
        actions: [
          { label: "去完善资料", href: "/dashboard/profile", variant: "secondary" },
        ],
        tone: "default",
        icon: <ClockIcon />,
      };
    }
    case "CONTACT_PREFERENCES":
      return {
        eyebrow: "建议补充",
        title: "想用其他联系方式接收引荐？",
        body: "默认展示注册邮箱。如果你更习惯微信，可以去名片里补充。",
        actions: [
          { label: "去编辑名片", href: "/dashboard/me", variant: "primary" },
        ],
        tone: "default",
        icon: <ProfileIcon />,
      };
    case "NO_OPEN_CYCLE":
      return {
        eyebrow: "暂未开放",
        title: "等待下一轮开放",
        body: "新一轮开放时这里会变为「选择本周意向」。",
        actions: [
          { label: "去完善资料", href: "/dashboard/profile", variant: "secondary" },
        ],
        tone: "default",
        icon: <CircleIcon />,
      };
  }
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

  const latestMatch = dashboard.latestMatch;
  const counterpart =
    latestMatch && initialUser
      ? latestMatch.participants.find((p) => p.userId !== initialUser.id) ??
        null
      : null;

  const focus = useMemo(
    () =>
      resolveFocus({
        dashboard,
        contactPreferences,
        questionnaire: {
          percent: questionnairePercent,
          submitted: questionnaireSubmitted,
          eligibleToOptIn: questionnaireEligibleToOptIn,
          hasIncompleteDraft: questionnaireHasIncompleteDraft,
          attention: questionnaireAttention,
        },
      }),
    [
      dashboard,
      contactPreferences,
      questionnairePercent,
      questionnaireSubmitted,
      questionnaireEligibleToOptIn,
      questionnaireHasIncompleteDraft,
      questionnaireAttention,
    ],
  );

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

  const focusProps = focusCardPropsFor(focus, {
    onOpenIntentSheet: openIntentSheetFromTask,
    onWithdraw: withdraw,
    saving,
    counterpartDisplayName: counterpart?.displayName ?? null,
    latestMatchVisibility: dashboard.latestMatchVisibility,
    latestMatchLimitedReason: dashboard.latestMatchLimitedReason,
  });
  const profileHasBlockingAttention = Boolean(
    questionnaireAttention &&
      ((questionnaireAttention.pendingUpdatedKeys?.length ?? 0) > 0 ||
        (questionnaireAttention.missingRequiredKeys?.length ?? 0) > 0),
  );

  // The primary Focus card is rendered as the wine-blushed "现在做" hero only
  // when there is something actionable now; passive/waiting states stay calm.
  // The attention/celebrate tones cover urgent + LIMITED-match cases; the
  // incomplete questionnaire is actionable too but carries a neutral tone.
  const isPrimaryActionable =
    focusProps.tone === "attention" ||
    focusProps.tone === "celebrate" ||
    focus.kind === "QUESTIONNAIRE_INCOMPLETE";

  const suggestions = resolveSuggestions({
    primaryFocusKind: focus.kind,
    questionnaire: {
      percent: questionnairePercent,
      eligibleToOptIn: questionnaireEligibleToOptIn,
      hasBlockingAttention: profileHasBlockingAttention,
    },
    contactPreferences,
  });

  const pendingCount = (isPrimaryActionable ? 1 : 0) + suggestions.length;

  const cycleEyebrow = cycle
    ? ["本轮", cycle.codename, describeDaysUntilLabel(cycle.revealAt)]
        .filter(Boolean)
        .join(" · ")
    : "本周";

  return (
    <div className="app-page-shell v2-page-shell home-dashboard">
      <header className="v2-greeting">
        <div className="v2-greeting-main">
          <span className="v2-greeting-eyebrow">{cycleEyebrow}</span>
          <h1>
            你好，{initialUser?.displayName ?? "同学"}
            <OliveSprigIllustration className="olive-sprig" />
          </h1>
          <p className="v2-greeting-sub">
            {pendingCount > 0
              ? `这一周，下面 ${pendingCount} 件事最值得你花几分钟。`
              : "新的一周，期待你的相遇。"}
          </p>
        </div>
      </header>

      {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      <FocusCard
        {...focusProps}
        variant={isPrimaryActionable ? "donow" : "default"}
      />

      <SuggestionList suggestions={suggestions} />

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
