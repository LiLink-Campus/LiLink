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
  totals: GenderBuckets & { total: number; submitted: number };
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

export type SortOrder = "asc" | "desc";

export type MatchLeaderboardResponse = {
  male: LeaderboardRow[];
  female: LeaderboardRow[];
  sort: string;
  order: SortOrder;
  limit: number;
  includeTest: boolean;
};
