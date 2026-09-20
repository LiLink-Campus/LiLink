import type { AuthMePayload } from "../../../lib/api";
import type {
  DashboardCurrentCycle,
  DashboardHistoryItem,
  DashboardMatch,
  DashboardPayload,
} from "../_lib/types";

const storyUserId = "story-user-001";
const storyCounterpartId = "story-user-002";

export const matchStoryUser = {
  id: storyUserId,
  email: "linh@example.edu.cn",
  displayName: "林和",
  preferredLocale: "zh-CN",

} satisfies AuthMePayload;

const baseCurrentCycle = {
  id: "cycle-spring-2030",
  codename: "2030 春日周",
  revealAt: "2030-04-12T12:00:00.000Z",
  participationDeadline: "2030-04-10T12:00:00.000Z",
  status: "OPEN",
  participationStatus: "OPTED_IN",
  intent: "BOTH",
} satisfies DashboardCurrentCycle;

const baseMatchedRound = {
  cycleId: "cycle-winter-2029",
  codename: "2029 冬日周",
  revealAt: "2029-12-15T12:00:00.000Z",
  participationStatus: "OPTED_IN",
  matched: true,
} satisfies DashboardPayload["lastRevealedRound"];

const storyCurrentParticipant = {
  userId: storyUserId,
  displayName: "林和",
  introLine: "想找一个能一起散步和聊书的人。",
  email: "linh@example.edu.cn",
  contact: {
    type: "EMAIL",
    label: "联络邮箱",
    value: "linh@example.edu.cn",
  },
  schoolName: "LiLink University",
  gender: "女生",
  partnerGenders: ["男生", "女生"],
  weeklyIntent: "BOTH",
} satisfies DashboardMatch["participants"][number];

const waitingHistory = [
  {
    cycleId: "cycle-autumn-2029",
    codename: "2029 秋日周",
    revealAt: "2029-10-18T12:00:00.000Z",
    participationStatus: "OPTED_OUT",
    result: "NOT_PARTICIPATED",
    visibility: "NOT_APPLICABLE",
    limitedReason: null,
    match: null,
  },
] satisfies DashboardHistoryItem[];

function makeCounterpart(
  overrides: Partial<DashboardMatch["participants"][number]> = {},
): DashboardMatch["participants"][number] {
  return {
    userId: storyCounterpartId,
    displayName: "陈一诺",
    introLine:
      "周末喜欢看展、做饭，也想找人一起探索城市角落。\n生活不只有课业，还有很多值得一起发现的有趣地方。\n如果你也喜欢这些，期待能认识你！",
    email: "yinuo@example.edu.cn",
    contact: {
      type: "WECHAT",
      label: "微信号",
      value: "yinuo-story",
    },
    schoolName: "North Campus",
    gender: "男生",
    partnerGenders: ["女生"],
    weeklyIntent: "DATE",
    ...overrides,
  };
}

function makeMatch(
  overrides: Partial<DashboardMatch> = {},
): DashboardMatch {
  return {
    id: "match-story-001",
    score: 91.4,
    introducedAt: null,
    reportStatus: null,
    participants: [
      {
        ...storyCurrentParticipant,
      },
      makeCounterpart({
        contact: null,
        email: null,
        displayName: "陈一诺",
      }),
    ],
    ...overrides,
  };
}

function makeDashboard(
  overrides: Partial<DashboardPayload> = {},
): DashboardPayload {
  return {
    user: matchStoryUser,
    questionnaireSubmittedAt: "2029-09-01T09:00:00.000Z",
    currentCycle: baseCurrentCycle,
    lastRevealedRound: baseMatchedRound,
    latestMatch: null,
    latestMatchVisibility: null,
    latestMatchLimitedReason: null,
    recentMatchHistory: waitingHistory,
    couponAgenda: null,
    ...overrides,
  };
}

const unintroducedStaleContactMatch = makeMatch({
  id: "match-story-stale-contact",
  participants: [storyCurrentParticipant, makeCounterpart()],
});

export const matchDashboardFixtures = {
  waitingNoResult: makeDashboard({
    lastRevealedRound: null,
    latestMatch: null,
    latestMatchVisibility: null,
    recentMatchHistory: [],
  }),

  matchedNotIntroduced: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-001",
      introducedAt: null,
      participants: [
        {
          ...storyCurrentParticipant,
        },
        makeCounterpart({
          displayName: "陈一诺",
          email: null,
          contact: null,
        }),
      ],
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  unintroducedStaleContact: makeDashboard({
    latestMatch: unintroducedStaleContactMatch,
    latestMatchVisibility: "VISIBLE",
    recentMatchHistory: [{
      ...baseMatchedRound,
      result: "MATCHED",
      visibility: "VISIBLE",
      limitedReason: null,
      match: unintroducedStaleContactMatch,
    }],
  }),

  unintroducedStaleEmail: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-stale-email",
      participants: [storyCurrentParticipant, makeCounterpart({ contact: null })],
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  introducedContactCompleted: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-002",
      score: 96.2,
      introducedAt: "2029-12-15T12:50:00.000Z",
      participants: [
        storyCurrentParticipant,
        makeCounterpart({
          displayName: "陈一诺同学（移动端长昵称测试）",
          contact: {
            type: "WECHAT",
            label: "微信号",
            value: "chenyinuo_29",
          },
          schoolName: "North Campus International Residential College",
        }),
      ],
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  introducedEmailFallback: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-introduced-email",
      introducedAt: "2029-12-15T12:50:00.000Z",
      participants: [storyCurrentParticipant, makeCounterpart({ contact: null })],
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  introducedContactUnavailable: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-introduced-unavailable",
      introducedAt: "2029-12-15T12:50:00.000Z",
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  lastRoundUnmatched: makeDashboard({
    lastRevealedRound: {
      cycleId: "cycle-winter-2029",
      codename: "2029 冬日周",
      revealAt: "2029-12-15T12:00:00.000Z",
      participationStatus: "OPTED_IN",
      matched: false,
    },
    latestMatch: null,
    latestMatchVisibility: null,
    recentMatchHistory: [
      {
        cycleId: "cycle-winter-2029",
        codename: "2029 冬日周",
        revealAt: "2029-12-15T12:00:00.000Z",
        participationStatus: "OPTED_IN",
        result: "UNMATCHED",
        visibility: "NOT_APPLICABLE",
        limitedReason: null,
        match: null,
      },
    ],
  }),

  limitedVisibility: makeDashboard({
    latestMatch: makeMatch({
      id: "match-story-limited",
      score: 84.8,
      introducedAt: "2030-04-09T13:00:00.000Z",
      reportStatus: "OPEN",
      participants: [
        {
          ...storyCurrentParticipant,
        },
        makeCounterpart({
          displayName: null,
          introLine: null,
          email: null,
          contact: null,
          schoolName: null,
          gender: null,
          partnerGenders: [],
          weeklyIntent: null,
        }),
      ],
    }),
    latestMatchVisibility: "LIMITED",
    latestMatchLimitedReason: "REPORTED",
  }),
} satisfies Record<string, DashboardPayload>;
