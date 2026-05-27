import type { AuthMePayload } from "../../../lib/api";
import type {
  DashboardCurrentCycle,
  DashboardHistoryItem,
  DashboardMatch,
  DashboardMeetupSummary,
  DashboardPayload,
  DashboardTask,
} from "../_lib/types";

const storyUserId = "story-user-001";
const storyCounterpartId = "story-user-002";

export const matchStoryUser = {
  id: storyUserId,
  email: "linh@example.edu.cn",
  displayName: "林和",
  preferredLocale: "zh-CN",
  meetupExpirationWeeks: 2,
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
  contactRequestedAt: "2029-12-15T12:30:00.000Z",
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
      "周末喜欢看展、做饭，也想找人一起探索城市角落。这里放一段偏长的一句话介绍，用来观察移动端卡片是否能自然换行。",
    email: "yinuo@example.edu.cn",
    contact: {
      type: "WECHAT",
      label: "微信号",
      value: "yinuo-story",
    },
    schoolName: "North Campus",
    contactRequestedAt: "2029-12-15T12:45:00.000Z",
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
    currentUserRequestedAt: null,
    reportStatus: null,
    participants: [
      {
        ...storyCurrentParticipant,
        contactRequestedAt: null,
      },
      makeCounterpart({
        contact: null,
        contactRequestedAt: null,
        email: null,
        displayName: "陈一诺",
      }),
    ],
    currentUserFeedback: null,
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
    tasks: [],
    meetupSummary: null,
    couponAgenda: null,
    ...overrides,
  };
}

const completedMeetup = {
  sessionId: "meetup-session-story-001",
  matchId: "match-story-002",
  status: "LOCKED",
  progressStatus: "LOCKED",
  href: "/dashboard/meetup/meetup-session-story-001",
  confirmedStartsAt: "2029-12-21T06:00:00.000Z",
  confirmedEndsAt: "2029-12-21T08:00:00.000Z",
  confirmedPlaceName: "湖边咖啡",
  canReviseAfterLock: true,
  canCancel: true,
  terminalText: null,
} satisfies DashboardMeetupSummary;

const completedMeetupTask = {
  id: "task-meetup-story-001",
  type: "MEETUP",
  priority: 10,
  title: "查看第一次见面安排",
  text: "时间和地点已经确认。",
  href: completedMeetup.href,
  userTurnStatus: "NONE",
  progressStatus: "LOCKED",
  matchId: completedMeetup.matchId,
  sessionId: completedMeetup.sessionId,
  updatedAt: "2029-12-16T09:00:00.000Z",
} satisfies DashboardTask;

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
      currentUserRequestedAt: null,
      participants: [
        {
          ...storyCurrentParticipant,
          contactRequestedAt: null,
        },
        makeCounterpart({
          displayName: "陈一诺",
          email: null,
          contact: null,
          contactRequestedAt: null,
        }),
      ],
    }),
    latestMatchVisibility: "VISIBLE",
  }),

  introducedContactCompleted: makeDashboard({
    latestMatch: makeMatch({
      id: completedMeetup.matchId,
      score: 96.2,
      introducedAt: "2029-12-15T12:50:00.000Z",
      currentUserRequestedAt: "2029-12-15T12:45:00.000Z",
      participants: [
        storyCurrentParticipant,
        makeCounterpart({
          displayName: "陈一诺同学（移动端长昵称测试）",
          contact: {
            type: "WECHAT",
            label: "微信号",
            value: "chen-yinuo-campus-exhibition-weekend-cooking-2029",
          },
          schoolName: "North Campus International Residential College",
        }),
      ],
      currentUserFeedback: {
        rating: 5,
        comment: "聊天很顺利，见面安排也已经确认。",
        submittedAt: "2029-12-18T10:00:00.000Z",
      },
    }),
    latestMatchVisibility: "VISIBLE",
    meetupSummary: null,
    tasks: [],
  }),

  introducedWithMeetupScheduled: makeDashboard({
    latestMatch: makeMatch({
      id: completedMeetup.matchId,
      score: 96.2,
      introducedAt: "2029-12-15T12:50:00.000Z",
      currentUserRequestedAt: "2029-12-15T12:45:00.000Z",
      participants: [storyCurrentParticipant, makeCounterpart()],
    }),
    latestMatchVisibility: "VISIBLE",
    meetupSummary: completedMeetup,
    tasks: [completedMeetupTask],
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
      introducedAt: null,
      currentUserRequestedAt: null,
      reportStatus: "OPEN",
      participants: [
        {
          ...storyCurrentParticipant,
          contactRequestedAt: null,
        },
        makeCounterpart({
          displayName: null,
          introLine: null,
          email: null,
          contact: null,
          contactRequestedAt: null,
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
