import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import {
  canEditCurrentCycleParticipation,
  lastRoundUnmatched,
} from "./format";
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
  | "heart"
  | "clipboard"
  | "profile"
  | "circle";

export type AgendaPriority = "high" | "medium" | "low";

export type AgendaItemStatus =
  | "done"
  | "todo"
  | "attention"
  | "waiting"
  | "celebrate";

export type AgendaItemAction = {
  label: string;
  kind: "intent-sheet" | "withdraw" | "link";
  href?: string;
  variant: "primary" | "secondary" | "ghost";
  loadingLabel?: string;
};

export type AgendaItemProgress = {
  confirmedPercent: number;
  unconfirmedPercent: number;
  unconfirmedCount: number;
};

export type AgendaItem = {
  id:
    | "MEETUP_NEEDS_ACTION"
    | "MEETUP_WAITING"
    | "MATCH_LIMITED"
    | "MATCH_INTRODUCED_NO_MEETUP"
    | "MATCH_REVEALED_AWAITING_INTRO"
    | "COUPONS_AVAILABLE"
    | "PARTICIPATION"
    | "PROFILE_CARD"
    | "QUESTIONNAIRE";
  priority: AgendaPriority;
  status: AgendaItemStatus;
  icon: AgendaIconKey;
  title: string;
  subtitle: string;
  progress?: AgendaItemProgress;
  actions: AgendaItemAction[];
  actionable: boolean;
};

type AgendaItemDraft = AgendaItem & {
  sortOrder: number;
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
  items: AgendaItem[];
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
    missingOneLinerIntro: boolean;
    eligibleToOptIn: boolean;
    attention: QuestionnaireAttentionPayload | null;
  };
};

const PRIORITY_SORT: Record<AgendaPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
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

function meetupAgendaItems(inputs: AgendaInputs): AgendaItemDraft[] {
  const { dashboard } = inputs;
  const tasks = dashboard.tasks ?? [];
  const items: AgendaItemDraft[] = [];

  // Meetup prompts (the two turn states are mutually exclusive).
  const needsAction = tasks.find(
    (t) => t.type === "MEETUP" && meetupTaskIsAttention(t),
  );
  const waiting = tasks.find(
    (t) => t.type === "MEETUP" && meetupTaskIsWaiting(t),
  );
  if (needsAction) {
    items.push({
      id: "MEETUP_NEEDS_ACTION",
      priority: "high",
      sortOrder: 10,
      actionable: true,
      status: "attention",
      icon: "calendar",
      title: "回应 TA 的见面提议",
      subtitle: "对方发来了几个时间和地点选项，去看看有没有合适的吧。",
      actions: [
        {
          label: "去回应",
          kind: "link",
          href: needsAction.href,
          variant: "primary",
        },
      ],
    });
  } else if (waiting) {
    items.push({
      id: "MEETUP_WAITING",
      priority: "medium",
      sortOrder: 30,
      actionable: true,
      status: "waiting",
      icon: "clock",
      title: "已把提议发给 TA",
      subtitle: "对方回应后，这里会立刻通知你。",
      actions: [
        {
          label: "查看提议",
          kind: "link",
          href: waiting.href,
          variant: "secondary",
        },
      ],
    });
  }

  return items;
}

function matchAgendaItems(inputs: AgendaInputs): AgendaItemDraft[] {
  const { dashboard, counterpartDisplayName } = inputs;
  const meetupSummary = dashboard.meetupSummary ?? null;
  const latestMatch = dashboard.latestMatch;
  const introduced = Boolean(latestMatch?.introducedAt);

  if (introduced && latestMatch && !meetupSummary) {
    if (dashboard.latestMatchVisibility === "LIMITED") {
      return [
        {
          id: "MATCH_LIMITED",
          priority: "medium",
          sortOrder: 35,
          actionable: true,
          status: "waiting",
          icon: "clock",
          title: "本轮匹配已受限",
          subtitle: "对方的可识别信息已隐藏，可在匹配页查看状态。",
          actions: [
            {
              label: "查看匹配状态",
              kind: "link",
              href: "/dashboard/match",
              variant: "secondary",
            },
          ],
        },
      ];
    }

    const name = counterpartDisplayName ?? "TA";
    return [
      {
        id: "MATCH_INTRODUCED_NO_MEETUP",
        priority: "high",
        sortOrder: 15,
        actionable: true,
        status: "celebrate",
        icon: "heart",
        title: `可以约 ${name} 见面了`,
        subtitle: "引荐邮件已发出。你可以直接给对方提议 2-3 个时间和地点。",
        actions: [
          {
            label: "安排见面",
            kind: "link",
            href: `/dashboard/meetup/start?matchId=${encodeURIComponent(latestMatch.id)}`,
            variant: "primary",
          },
        ],
      },
    ];
  }

  if (
    latestMatch &&
    !introduced &&
    dashboard.latestMatchVisibility !== "LIMITED"
  ) {
    return [
      {
        id: "MATCH_REVEALED_AWAITING_INTRO",
        priority: "high",
        sortOrder: 15,
        actionable: true,
        status: "celebrate",
        icon: "heart",
        title: "本轮为你匹配到了 TA",
        subtitle: "你可以选择交换联系方式，或者直接发起第一次见面。",
        actions: [
          {
            label: "查看匹配详情",
            kind: "link",
            href: "/dashboard/match",
            variant: "primary",
          },
        ],
      },
    ];
  }

  return [];
}

function couponAgendaItem(inputs: AgendaInputs): AgendaItemDraft | null {
  const couponAgenda = inputs.dashboard.couponAgenda ?? null;
  if (!couponAgenda || couponAgenda.unreadAvailableCount <= 0) {
    return null;
  }

  return {
    id: "COUPONS_AVAILABLE",
    priority: "high",
    sortOrder: 20,
    actionable: true,
    status: "attention",
    icon: "clipboard",
    title: `有 ${couponAgenda.unreadAvailableCount} 张新优惠券`,
    subtitle:
      couponAgenda.availableCount > couponAgenda.unreadAvailableCount
        ? `共 ${couponAgenda.availableCount} 张可用。`
        : "到店消费可用。",
    actions: [
      {
        label: "查看优惠券",
        kind: "link",
        href: couponAgenda.href,
        variant: "primary",
      },
    ],
  };
}

function participationItem(inputs: AgendaInputs): AgendaItemDraft {
  const cycle = inputs.dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle);
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const intent = cycle?.intent ?? null;
  const unmatchedNote = lastRoundUnmatched(inputs.dashboard)
    ? "上一轮未匹配成功，下一轮重新加入即可再试。"
    : "";

  if (!cycle) {
    return {
      id: "PARTICIPATION",
      priority: "low",
      sortOrder: 80,
      actionable: false,
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
      priority: "low",
      sortOrder: 70,
      actionable: false,
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
      priority: "medium",
      sortOrder: 50,
      actionable: true,
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
    priority: "low",
    sortOrder: 75,
    actionable: false,
    status: "done",
    icon: "clock",
    title: "本轮报名已截止",
    subtitle: revealLabel
      ? `「${cycle.codename}」将于 ${revealLabel} 揭晓。`
      : "等待揭晓中。",
    actions: [],
  };
}

function profileItem(inputs: AgendaInputs): AgendaItemDraft {
  if (inputs.questionnaire.missingOneLinerIntro) {
    return {
      id: "PROFILE_CARD",
      priority: "high",
      sortOrder: 40,
      actionable: true,
      status: "attention",
      icon: "profile",
      title: "完善一句话介绍",
      subtitle: "参与本轮匹配前，请先在名片中填写一句话介绍。",
      actions: [
        {
          label: "去填写",
          kind: "link",
          href: "/dashboard/me/card",
          variant: "primary",
        },
      ],
    };
  }

  const isDefault = contactPreferencesAreDefault(inputs.contactPreferences);
  return {
    id: "PROFILE_CARD",
    priority: "low",
    sortOrder: isDefault ? 65 : 90,
    actionable: isDefault,
    status: isDefault ? "todo" : "done",
    icon: "profile",
    title: "完善个人名片",
    subtitle: isDefault
      ? "默认展示注册邮箱。补充微信后，引荐时 TA 更容易找到你。"
      : "联系方式偏好已设置。",
    actions: isDefault
      ? [
          {
            label: "去补充",
            kind: "link",
            href: "/dashboard/me",
            variant: "secondary",
          },
        ]
      : [
          {
            label: "查看名片",
            kind: "link",
            href: "/dashboard/me",
            variant: "ghost",
          },
        ],
  };
}

function questionnaireItem(inputs: AgendaInputs): AgendaItemDraft {
  const q = inputs.questionnaire;
  const missingCount = q.attention?.missingRequiredKeys?.length ?? 0;
  const pendingCount = q.attention?.pendingUpdatedKeys?.length ?? 0;
  const progress: AgendaItemProgress = {
    confirmedPercent: q.confirmedPercent,
    unconfirmedPercent: q.unconfirmedPercent,
    unconfirmedCount: q.unconfirmedCount,
  };

  if (missingCount > 0) {
    return {
      id: "QUESTIONNAIRE",
      priority: "high",
      sortOrder: 35,
      actionable: true,
      status: "attention",
      icon: "clipboard",
      title: "匹配资料有必填项待补全",
      subtitle: `还有 ${missingCount} 项必填内容需要补完，才能参与本轮匹配。`,
      progress,
      actions: [
        {
          label: "去补全",
          kind: "link",
          href: questionnaireHref(q.attention, "missing"),
          variant: "primary",
        },
      ],
    };
  }

  if (pendingCount > 0) {
    return {
      id: "QUESTIONNAIRE",
      priority: "high",
      sortOrder: 36,
      actionable: true,
      status: "attention",
      icon: "clipboard",
      title: "匹配资料有待确认项",
      subtitle: `${pendingCount} 项是问卷更新后的系统默认值，还没经你确认。`,
      progress,
      actions: [
        {
          label: `去确认这 ${pendingCount} 项`,
          kind: "link",
          href: questionnaireHref(q.attention, "pending"),
          variant: "primary",
        },
      ],
    };
  }

  if (!q.eligibleToOptIn) {
    if (q.missingOneLinerIntro) {
      return {
        id: "QUESTIONNAIRE",
        priority: "low",
        sortOrder: 85,
        actionable: false,
        status: "done",
        icon: "clipboard",
        title: "匹配资料已就绪",
        subtitle: "问卷部分已完成；完善名片中的一句话介绍后即可参加本轮。",
        progress,
        actions: [
          {
            label: "查看资料",
            kind: "link",
            href: questionnaireHref(q.attention),
            variant: "ghost",
          },
        ],
      };
    }

    return {
      id: "QUESTIONNAIRE",
      priority: "high",
      sortOrder: 35,
      actionable: true,
      status: "todo",
      icon: "clipboard",
      title: q.submitted ? "继续完善匹配资料" : "先完成匹配资料",
      subtitle: "填完资料就能参加本轮匹配，算法会据此为你寻找相容的人。",
      progress,
      actions: [
        {
          label: "继续填写",
          kind: "link",
          href: questionnaireHref(q.attention),
          variant: "primary",
        },
      ],
    };
  }

  return {
    id: "QUESTIONNAIRE",
    priority: "low",
    sortOrder: q.percent >= 100 ? 95 : 60,
    actionable: q.percent < 100,
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
        ? [
            {
              label: "查看资料",
              kind: "link",
              href: questionnaireHref(q.attention),
              variant: "ghost",
            },
          ]
        : [
            {
              label: "继续",
              kind: "link",
              href: questionnaireHref(q.attention),
              variant: "secondary",
            },
          ],
  };
}

function sortedAgendaItems(items: AgendaItemDraft[]): AgendaItem[] {
  return [...items]
    .sort((a, b) => {
      const priorityDelta = PRIORITY_SORT[a.priority] - PRIORITY_SORT[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return a.sortOrder - b.sortOrder;
    })
    .map((item) => ({
      id: item.id,
      priority: item.priority,
      status: item.status,
      icon: item.icon,
      title: item.title,
      subtitle: item.subtitle,
      progress: item.progress,
      actions: item.actions,
      actionable: item.actionable,
    }));
}

export function resolveAgenda(inputs: AgendaInputs): Agenda {
  const couponItem = couponAgendaItem(inputs);
  const items = [
    ...meetupAgendaItems(inputs),
    ...matchAgendaItems(inputs),
    ...(couponItem ? [couponItem] : []),
    participationItem(inputs),
    profileItem(inputs),
    questionnaireItem(inputs),
  ];

  return {
    countdown: resolveCountdown(inputs),
    items: sortedAgendaItems(items),
  };
}

export function countActionableAgendaItems(agenda: Agenda): number {
  return agenda.items.filter((item) => item.actionable).length;
}
