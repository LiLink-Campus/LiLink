type GenderBuckets = {
  male: number;
  female: number;
  nonBinary: number;
  unknown: number;
};

type SchoolGenderRow = GenderBuckets & {
  schoolId: string | null;
  schoolName: string;
  total: number;
};

export type SchoolsGenderResponse = {
  schools: SchoolGenderRow[];
  totals: GenderBuckets & { total: number };
  includeTest: boolean;
};

type WeeklyOptinCycle = {
  cycleId: string;
  codename: string;
  revealAt: string;
  status: string;
  optedIn: GenderBuckets & { total: number };
  femaleShare: number | null;
};

export type WeeklyOptinResponse = {
  cycles: WeeklyOptinCycle[];
  includeTest: boolean;
};

export type LeaderboardRow = {
  userId: string;
  displayName: string | null;
  email: string;
  schoolName: string | null;
  optInRounds: number;
  matchedRounds: number;
  matchRate: number | null;
  currentMatchStreak: number;
  currentUnmatchedStreak: number;
};

export type LeaderboardSortKey =
  | "unmatchedStreak"
  | "matchStreak"
  | "matchRate"
  | "matchedRounds"
  | "optInRounds";

export type SortOrder = "asc" | "desc";

export type MatchLeaderboardResponse = {
  male: LeaderboardRow[];
  female: LeaderboardRow[];
  sort: string;
  order: SortOrder;
  limit: number;
  includeTest: boolean;
};

type ProductAnalyticsRangeKey = "7d" | "30d" | "60d";

type ProductAnalyticsKpis = {
  activeUsers: number;
  totalEvents: number;
  todayEvents: number;
  couponRedeemRate: number | null;
  meetupCompletionRate: number | null;
  optinRate: null;
};

type ProductAnalyticsFunnelStep = {
  key: string;
  label: string;
  eventName: string;
  value: number;
  kind: "footprint" | "intent" | "outcome";
};

type ProductAnalyticsFunnel = {
  key: string;
  title: string;
  description: string;
  steps: ProductAnalyticsFunnelStep[];
};

export type ProductAnalyticsMissing = {
  key: string;
  label: string;
  reason: string;
};

export type ProductAnalyticsResponse = {
  range: ProductAnalyticsRangeKey;
  since: string;
  until: string;
  includeTest: boolean;
  kpis: ProductAnalyticsKpis;
  funnels: ProductAnalyticsFunnel[];
  missing: ProductAnalyticsMissing[];
};
