import { Injectable } from '@nestjs/common';
import { GenderBuckets } from '../../common/analytics/gender';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface SchoolGenderRow extends GenderBuckets {
  schoolId: string | null;
  schoolName: string;
  total: number;
}

export interface SchoolsGenderResponse {
  schools: SchoolGenderRow[];
  totals: GenderBuckets & { total: number };
  includeTest: boolean;
}

export interface WeeklyOptinCycle {
  cycleId: string;
  codename: string;
  revealAt: string;
  status: string;
  optedIn: GenderBuckets & { total: number };
  femaleShare: number | null;
}

export interface WeeklyOptinResponse {
  cycles: WeeklyOptinCycle[];
  includeTest: boolean;
}

export interface LeaderboardRow {
  userId: string;
  displayName: string | null;
  email: string;
  schoolName: string | null;
  optInRounds: number;
  matchedRounds: number;
  matchRate: number | null;
  currentMatchStreak: number;
  currentUnmatchedStreak: number;
}

export interface MatchLeaderboardResponse {
  male: LeaderboardRow[];
  female: LeaderboardRow[];
  sort: string;
  order: 'asc' | 'desc';
  limit: number;
  includeTest: boolean;
}

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
}
