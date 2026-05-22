import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import { canEditCurrentCycleParticipation } from "./format";
import {
  contactPreferencesAreDefault,
  describeRelativeUntil,
  describeRevealMoment,
  meetupTaskIsAttention,
  meetupTaskIsWaiting,
  questionnaireHref,
} from "./focus";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  QuestionnaireAttentionPayload,
} from "./types";

export type AgendaIconKey =
  | "calendar"
  | "clock"
  | "sparkles"
  | "heart"
  | "clipboard"
  | "profile"
  | "circle";

export type AgendaTone = "attention" | "celebrate" | "waiting";

export type AgendaAlert = {
  id: string;
  tone: AgendaTone;
  icon: AgendaIconKey;
  title: string;
  body: string;
  action: { label: string; href: string };
};

export type AgendaTodoStatus = "done" | "todo" | "attention";

export type AgendaTodoAction = {
  label: string;
  kind: "intent-sheet" | "withdraw" | "link";
  href?: string;
  variant: "primary" | "secondary" | "ghost";
  loadingLabel?: string;
};

export type AgendaTodoProgress = {
  confirmedPercent: number;
  unconfirmedPercent: number;
  unconfirmedCount: number;
};

export type AgendaTodo = {
  id: "PARTICIPATION" | "PROFILE_CARD" | "QUESTIONNAIRE";
  status: AgendaTodoStatus;
  icon: AgendaIconKey;
  title: string;
  subtitle: string;
  progress?: AgendaTodoProgress;
  actions: AgendaTodoAction[];
};

// 常驻倒计时：无论是否匹配到都显示
export type AgendaCountdown =
  | {
      state: "upcoming";
      codename: string;
      revealLabel: string;
      relativeLabel: string | null;
    }
  | { state: "none" };

export type Agenda = {
  countdown: AgendaCountdown;
  alerts: AgendaAlert[];
  todos: AgendaTodo[];
};

export type AgendaInputs = {
  dashboard: DashboardPayload;
  contactPreferences: ContactPreferencesPayload;
  counterpartDisplayName: string | null;
  questionnaire: {
    percent: number;
    confirmedPercent: number;
    unconfirmedPercent: number;
    unconfirmedCount: number;
    submitted: boolean;
    eligibleToOptIn: boolean;
    attention: QuestionnaireAttentionPayload | null;
  };
};

function resolveCountdown(inputs: AgendaInputs): AgendaCountdown {
  const cycle = inputs.dashboard.currentCycle;
  if (!cycle) {
    return { state: "none" };
  }
  const revealLabel = describeRevealMoment(cycle.revealAt);
  if (!revealLabel) {
    return { state: "none" };
  }
  return {
    state: "upcoming",
    codename: cycle.codename,
    revealLabel,
    relativeLabel: describeRelativeUntil(cycle.revealAt),
  };
}

function resolveAlerts(inputs: AgendaInputs): AgendaAlert[] {
  const { dashboard, counterpartDisplayName } = inputs;
  const tasks = dashboard.tasks ?? [];
  const meetupSummary = dashboard.meetupSummary ?? null;
  const alerts: AgendaAlert[] = [];

  const needsAction = tasks.find(
    (t) => t.type === "MEETUP" && meetupTaskIsAttention(t),
  );
  if (needsAction) {
    alerts.push({
      id: "MEETUP_NEEDS_ACTION",
      tone: "attention",
      icon: "calendar",
      title: "回应 TA 的见面提议",
      body: "对方发来了几个时间和地点选项，去看看有没有合适的吧。",
      action: { label: "去回应", href: needsAction.href },
    });
    return alerts;
  }

  const waiting = tasks.find(
    (t) => t.type === "MEETUP" && meetupTaskIsWaiting(t),
  );
  if (waiting) {
    alerts.push({
      id: "MEETUP_WAITING",
      tone: "waiting",
      icon: "clock",
      title: "已把提议发给 TA",
      body: "对方回应后，这里会立刻通知你。",
      action: { label: "查看提议", href: waiting.href },
    });
    return alerts;
  }

  const latestMatch = dashboard.latestMatch;
  const introduced = Boolean(latestMatch?.introducedAt);
  if (introduced && latestMatch && !meetupSummary) {
    if (dashboard.latestMatchVisibility === "LIMITED") {
      alerts.push({
        id: "MATCH_LIMITED",
        tone: "waiting",
        icon: "clock",
        title: "本轮匹配已受限",
        body: "对方的可识别信息已隐藏，可在匹配页查看状态。",
        action: { label: "查看匹配状态", href: "/dashboard/match" },
      });
      return alerts;
    }
    const name = counterpartDisplayName ?? "TA";
    alerts.push({
      id: "MATCH_INTRODUCED_NO_MEETUP",
      tone: "celebrate",
      icon: "sparkles",
      title: `可以约 ${name} 见面了`,
      body: "引荐邮件已发出。你可以直接给对方提议 2-3 个时间和地点。",
      action: {
        label: "安排见面",
        href: `/dashboard/meetup/start?matchId=${encodeURIComponent(latestMatch.id)}`,
      },
    });
    return alerts;
  }

  if (
    latestMatch &&
    !introduced &&
    dashboard.latestMatchVisibility !== "LIMITED"
  ) {
    alerts.push({
      id: "MATCH_REVEALED_AWAITING_INTRO",
      tone: "celebrate",
      icon: "sparkles",
      title: "本轮为你匹配到了 TA",
      body: "你可以选择交换联系方式，或者直接发起第一次见面。",
      action: { label: "查看匹配详情", href: "/dashboard/match" },
    });
    return alerts;
  }

  return alerts;
}

function lastRoundUnmatched(inputs: AgendaInputs): boolean {
  const last = inputs.dashboard.lastRevealedRound;
  return Boolean(
    last &&
      last.participationStatus === "OPTED_IN" &&
      !last.matched &&
      !inputs.dashboard.latestMatch,
  );
}

function participationTodo(inputs: AgendaInputs): AgendaTodo {
  const cycle = inputs.dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle);
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const intent = cycle?.intent ?? null;
  const unmatchedNote = lastRoundUnmatched(inputs)
    ? "上一轮未匹配成功，下一轮重新加入即可再试。"
    : "";

  if (!cycle) {
    return {
      id: "PARTICIPATION",
      status: "done",
      icon: "circle",
      title: "本周参与",
      subtitle:
        `${unmatchedNote}暂无开放中的轮次，新一轮开放时这里会提醒你选择意向。`.trim(),
      actions: [],
    };
  }

  const revealLabel = describeRevealMoment(cycle.revealAt);
  const relative = describeRelativeUntil(cycle.revealAt);

  if (isOptedIn && intent && canEdit) {
    return {
      id: "PARTICIPATION",
      status: "done",
      icon: "heart",
      title: `本周已参加 · 意向 ${WEEKLY_INTENT_LABELS[intent].primary}`,
      subtitle: revealLabel
        ? `将于 ${revealLabel} 揭晓${relative ? `（${relative}）` : ""}。`
        : "等待揭晓中。",
      actions: [
        {
          label: "更换意向",
          kind: "intent-sheet",
          variant: "secondary",
          loadingLabel: "更新中",
        },
        {
          label: "取消参与",
          kind: "withdraw",
          variant: "ghost",
          loadingLabel: "取消中",
        },
      ],
    };
  }

  if (canEdit) {
    return {
      id: "PARTICIPATION",
      status: "todo",
      icon: "heart",
      title: "选择本周意向，参加本轮",
      subtitle: `${unmatchedNote}Friend / Date / Both，选定即报名成功。${
        revealLabel ? `${revealLabel} 揭晓。` : ""
      }`.trim(),
      actions: [
        {
          label: "选择本周意向",
          kind: "intent-sheet",
          variant: "primary",
          loadingLabel: "保存中",
        },
      ],
    };
  }

  // 已锁定（报名截止后）
  return {
    id: "PARTICIPATION",
    status: "done",
    icon: "clock",
    title: "本轮报名已截止",
    subtitle: revealLabel
      ? `「${cycle.codename}」将于 ${revealLabel} 揭晓。`
      : "等待揭晓中。",
    actions: [],
  };
}

function profileTodo(inputs: AgendaInputs): AgendaTodo {
  const isDefault = contactPreferencesAreDefault(inputs.contactPreferences);
  return {
    id: "PROFILE_CARD",
    status: isDefault ? "todo" : "done",
    icon: "profile",
    title: "完善个人名片",
    subtitle: isDefault
      ? "默认展示注册邮箱。补充微信后，引荐时 TA 更容易找到你。"
      : "联系方式偏好已设置。",
    actions: isDefault
      ? [{ label: "去补充", kind: "link", href: "/dashboard/me", variant: "secondary" }]
      : [{ label: "查看名片", kind: "link", href: "/dashboard/me", variant: "ghost" }],
  };
}

function questionnaireTodo(inputs: AgendaInputs): AgendaTodo {
  const q = inputs.questionnaire;
  const href = questionnaireHref(q.attention);
  const progress: AgendaTodoProgress = {
    confirmedPercent: q.confirmedPercent,
    unconfirmedPercent: q.unconfirmedPercent,
    unconfirmedCount: q.unconfirmedCount,
  };

  if (q.unconfirmedCount > 0) {
    return {
      id: "QUESTIONNAIRE",
      status: "attention",
      icon: "clipboard",
      title: "匹配资料有待确认项",
      subtitle: `${q.unconfirmedCount} 项是问卷更新后的系统默认值，还没经你确认。`,
      progress,
      actions: [
        {
          label: `去确认这 ${q.unconfirmedCount} 项`,
          kind: "link",
          href,
          variant: "primary",
        },
      ],
    };
  }

  if (!q.eligibleToOptIn) {
    return {
      id: "QUESTIONNAIRE",
      status: "todo",
      icon: "clipboard",
      title: q.submitted ? "继续完善匹配资料" : "先完成匹配资料",
      subtitle: "填完资料就能参加本轮匹配，算法会据此为你寻找相容的人。",
      progress,
      actions: [{ label: "继续填写", kind: "link", href, variant: "primary" }],
    };
  }

  return {
    id: "QUESTIONNAIRE",
    status: q.percent >= 100 ? "done" : "todo",
    icon: "clipboard",
    title: q.percent >= 100 ? "匹配资料已就绪" : "补完匹配资料的可选项",
    subtitle:
      q.percent >= 100
        ? "全部确认完成，算法已可使用你的资料。"
        : `当前 ${q.percent}% 完成，补完后相容度判断会更精准。`,
    progress,
    actions:
      q.percent >= 100
        ? [{ label: "查看资料", kind: "link", href, variant: "ghost" }]
        : [{ label: "继续", kind: "link", href, variant: "secondary" }],
  };
}

export function resolveAgenda(inputs: AgendaInputs): Agenda {
  return {
    countdown: resolveCountdown(inputs),
    alerts: resolveAlerts(inputs),
    todos: [
      participationTodo(inputs),
      profileTodo(inputs),
      questionnaireTodo(inputs),
    ],
  };
}

export function countActionableAgendaItems(agenda: Agenda): number {
  const todoCount = agenda.todos.filter(
    (t) => t.status === "todo" || t.status === "attention",
  ).length;
  return agenda.alerts.length + todoCount;
}
