import { canEditCurrentCycleParticipation, lastRoundUnmatched } from "./format";
import {
  contactPreferencesAreDefault,
  describeRelativeUntil,
  describeRevealMoment,
  questionnaireHref,
} from "./focus";
import type {
  ContactPreferencesPayload,
  DashboardPayload,
  QuestionnaireAttentionPayload,
} from "./types";

type AgendaPriority = "high" | "medium" | "low";

export type AgendaItemAction = {
  label: string;
  kind: "intent-sheet" | "withdraw" | "link";
  href?: string;
  loadingLabel?: string;
};

export type AgendaItem = {
  id:
    | "MATCH_LIMITED"
    | "MATCH_INTRODUCED"
    | "MATCH_REVEALED_AWAITING_INTRO"
    | "PARTICIPATION"
    | "PROFILE_CARD"
    | "QUESTIONNAIRE";
  priority: AgendaPriority;
  title: string;
  subtitle: string;
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
      revealAt: string;
    }
  | { state: "none" };

export type Agenda = {
  countdown: AgendaCountdown;
  items: AgendaItem[];
};

export type AgendaInputs = {
  dashboard: DashboardPayload;
  /** Frozen render-time clock so agenda copy stays hydration-stable. */
  nowMs: number;
  contactPreferences: ContactPreferencesPayload;
  counterpartDisplayName: string | null;
  questionnaire: {
    percent: number;
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
    revealAt: cycle.revealAt,
  };
}

function matchAgendaItems(inputs: AgendaInputs): AgendaItemDraft[] {
  const { dashboard, counterpartDisplayName } = inputs;
  const latestMatch = dashboard.latestMatch;
  const introduced = Boolean(latestMatch?.introducedAt);

  if (introduced && latestMatch) {
    if (dashboard.latestMatchVisibility === "LIMITED") {
      return [
        {
          id: "MATCH_LIMITED",
          priority: "medium",
          sortOrder: 35,
          actionable: true,
          title: "本轮匹配已受限",
          subtitle: "对方的可识别信息已隐藏，可在匹配页查看状态。",
          actions: [
            {
              label: "查看匹配状态",
              kind: "link",
              href: "/dashboard/match",
            },
          ],
        },
      ];
    }

    const name = counterpartDisplayName ?? "TA";
    return [
      {
        id: "MATCH_INTRODUCED",
        priority: "high",
        sortOrder: 15,
        actionable: false,
        title: `你与 ${name} 的来信已送达`,
        subtitle: "到匹配页查看对方介绍与联系方式，接下来的交流由你们决定。",
        actions: [
          {
            label: "查看 TA 的联系方式",
            kind: "link",
            href: "/dashboard/match",
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
        title: "本轮为你匹配到了 TA",
        subtitle: "可以直接查看对方介绍与联系方式，接下来的交流由你们决定。",
        actions: [
          {
            label: "查看匹配详情",
            kind: "link",
            href: "/dashboard/match",
          },
        ],
      },
    ];
  }

  return [];
}

function participationItem(inputs: AgendaInputs): AgendaItemDraft {
  const cycle = inputs.dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle, inputs.nowMs);
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
      title: "本周参与",
      subtitle:
        `${unmatchedNote}暂无开放中的轮次，新一轮开放时这里会提醒你选择意向。`.trim(),
      actions: [],
    };
  }

  const revealLabel = describeRevealMoment(cycle.revealAt);
  const relative = describeRelativeUntil(cycle.revealAt, inputs.nowMs);

  if (isOptedIn && intent && canEdit) {
    return {
      id: "PARTICIPATION",
      priority: "low",
      sortOrder: 70,
      actionable: false,
      title: `本周已参加 · 意向 ${({ FRIEND: "认识朋友", DATE: "浪漫约会", BOTH: "朋友或约会都可以" })[intent]}`,
      subtitle: revealLabel
        ? `将于 ${revealLabel} 揭晓${relative ? `（${relative}）` : ""}。`
        : "等待揭晓中。",
      actions: [
        {
          label: "更换意向",
          kind: "intent-sheet",
          loadingLabel: "更新中",
        },
        {
          label: "取消参与",
          kind: "withdraw",
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
      title: "选择本周意向，参加本轮",
      subtitle: `${unmatchedNote}Friend / Date / Both，选定即报名成功。${
        revealLabel ? `${revealLabel} 揭晓。` : ""
      }`.trim(),
      actions: [
        {
          label: "选择本周意向",
          kind: "intent-sheet",
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
      title: "完善一句话介绍",
      subtitle: "参与匹配前，请在「我的资料 · 关于你」中填写一句话介绍。",
      actions: [
        {
          label: "去填写",
          kind: "link",
          href: "/dashboard/profile",
        },
      ],
    };
  }

  const isDefault = contactPreferencesAreDefault(inputs.contactPreferences);
  return {
    id: "PROFILE_CARD",
    priority: "low",
    sortOrder: isDefault ? 65 : 90,
    actionable: false,
    title: "管理联系方式",
    subtitle: isDefault
      ? "当前使用注册邮箱联系。也可以在「关于你」中选择其他方式。"
      : "联系方式偏好已设置。",
    actions: isDefault
      ? [
          {
            label: "编辑联系方式",
            kind: "link",
            href: "/dashboard/profile",
          },
        ]
      : [
          {
            label: "查看资料",
            kind: "link",
            href: "/dashboard/profile",
          },
        ],
  };
}

function questionnaireItem(inputs: AgendaInputs): AgendaItemDraft {
  const q = inputs.questionnaire;
  const missingCount = q.attention?.missingRequiredKeys?.length ?? 0;
  const pendingCount = q.attention?.pendingUpdatedKeys?.length ?? 0;

  if (missingCount > 0) {
    return {
      id: "QUESTIONNAIRE",
      priority: "high",
      sortOrder: 35,
      actionable: true,
      title: "匹配资料有必填项待补全",
      subtitle: `还有 ${missingCount} 项必填内容需要补完，才能参与本轮匹配。`,
      actions: [
        {
          label: "去补全",
          kind: "link",
          href: questionnaireHref(q.attention, "missing"),
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
      title: "匹配资料有待确认项",
      subtitle: `${pendingCount} 项是问卷更新后的系统默认值，还没经你确认。`,
      actions: [
        {
          label: `去确认这 ${pendingCount} 项`,
          kind: "link",
          href: questionnaireHref(q.attention, "pending"),
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
        title: "匹配资料已就绪",
        subtitle: "问卷部分已完成；完善名片中的一句话介绍后即可参加本轮。",
        actions: [
          {
            label: "查看资料",
            kind: "link",
            href: questionnaireHref(q.attention),
          },
        ],
      };
    }

    return {
      id: "QUESTIONNAIRE",
      priority: "high",
      sortOrder: 35,
      actionable: true,
      title: q.submitted ? "继续完善匹配资料" : "先完成匹配资料",
      subtitle: "填完资料就能参加本轮匹配，算法会据此为你寻找相容的人。",
      actions: [
        {
          label: "继续填写",
          kind: "link",
          href: questionnaireHref(q.attention),
        },
      ],
    };
  }

  return {
    id: "QUESTIONNAIRE",
    priority: "low",
    sortOrder: q.percent >= 100 ? 95 : 60,
    actionable: q.percent < 100,
    title: q.percent >= 100 ? "匹配资料已就绪" : "补完匹配资料的可选项",
    subtitle:
      q.percent >= 100
        ? "全部确认完成，算法已可使用你的资料。"
        : `当前 ${q.percent}% 完成，补完后相容度判断会更精准。`,
    actions:
      q.percent >= 100
        ? [
            {
              label: "查看资料",
              kind: "link",
              href: questionnaireHref(q.attention),
            },
          ]
        : [
            {
              label: "继续",
              kind: "link",
              href: questionnaireHref(q.attention),
            },
          ],
  };
}

function sortedAgendaItems(items: AgendaItemDraft[]): AgendaItem[] {
  return [...items]
    .sort((a, b) => {
      const priorityDelta =
        PRIORITY_SORT[a.priority] - PRIORITY_SORT[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return a.sortOrder - b.sortOrder;
    })
    .map((item) => ({
      id: item.id,
      priority: item.priority,
      title: item.title,
      subtitle: item.subtitle,
      actions: item.actions,
      actionable: item.actionable,
    }));
}

export function resolveAgenda(inputs: AgendaInputs): Agenda {
  const items = [
    ...matchAgendaItems(inputs),
    participationItem(inputs),
    profileItem(inputs),
    questionnaireItem(inputs),
  ];

  return {
    countdown: resolveCountdown(inputs),
    items: sortedAgendaItems(items),
  };
}
