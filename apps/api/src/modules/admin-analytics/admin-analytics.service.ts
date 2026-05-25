import { Injectable } from '@nestjs/common';
import {
  addGender,
  emptyGenderBuckets,
  GenderBuckets,
  genderKey,
  resolveHardGender,
} from '../../common/analytics/gender';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AnalyticsBaseQueryDto,
  LeaderboardSortKey,
  MatchLeaderboardQueryDto,
  WeeklyOptinQueryDto,
} from './dto/analytics-query.dto';
import {
  computeLeaderboardMetrics,
  UserCycleOutcome,
} from './leaderboard-metrics';

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

const SORT_FIELD: Record<LeaderboardSortKey, keyof LeaderboardRow> = {
  unmatchedStreak: 'currentUnmatchedStreak',
  matchStreak: 'currentMatchStreak',
  matchRate: 'matchRate',
  matchedRounds: 'matchedRounds',
  optInRounds: 'optInRounds',
};

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async schoolsGender(
    query: AnalyticsBaseQueryDto,
  ): Promise<SchoolsGenderResponse> {
    const includeTest = query.includeTest === true;
    const users = await this.prisma.user.findMany({
      where: includeTest ? {} : { isTest: false },
      select: {
        schoolId: true,
        school: { select: { name: true } },
        questionnaireResponse: { select: { submittedAt: true, answers: true } },
      },
    });

    const noSchool = '__none__';
    const bySchool = new Map<
      string,
      { schoolId: string | null; schoolName: string; buckets: GenderBuckets }
    >();
    const totals = emptyGenderBuckets();

    for (const user of users) {
      const schoolKey = user.schoolId ?? noSchool;
      let entry = bySchool.get(schoolKey);
      if (!entry) {
        entry = {
          schoolId: user.schoolId,
          schoolName: user.school?.name ?? '（未分配学校）',
          buckets: emptyGenderBuckets(),
        };
        bySchool.set(schoolKey, entry);
      }

      const key = genderKey(resolveHardGender(user.questionnaireResponse));
      entry.buckets[key] += 1;
      totals[key] += 1;
    }

    const schools: SchoolGenderRow[] = Array.from(bySchool.values())
      .map((entry) => {
        const { male, female, nonBinary, unknown } = entry.buckets;
        return {
          schoolId: entry.schoolId,
          schoolName: entry.schoolName,
          male,
          female,
          nonBinary,
          unknown,
          total: male + female + nonBinary + unknown,
        };
      })
      .sort((a, b) => b.total - a.total);

    const total =
      totals.male + totals.female + totals.nonBinary + totals.unknown;

    return {
      schools,
      totals: { ...totals, total },
      includeTest,
    };
  }

  async weeklyOptin(query: WeeklyOptinQueryDto): Promise<WeeklyOptinResponse> {
    const includeTest = query.includeTest === true;
    const limit = query.limit ?? 12;

    const cycles = await this.prisma.matchCycle.findMany({
      where: {
        status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY', 'REVEALED'] },
      },
      orderBy: { revealAt: 'desc' },
      take: limit,
      select: { id: true, codename: true, revealAt: true, status: true },
    });

    const cycleIds = cycles.map((cycle) => cycle.id);
    const participations =
      cycleIds.length > 0
        ? await this.prisma.cycleParticipation.findMany({
            where: {
              cycleId: { in: cycleIds },
              status: 'OPTED_IN',
              intent: { not: null },
              ...(includeTest ? {} : { user: { isTest: false } }),
            },
            select: {
              cycleId: true,
              user: {
                select: {
                  questionnaireResponse: {
                    select: { submittedAt: true, answers: true },
                  },
                },
              },
            },
          })
        : [];

    const buckets = new Map<string, GenderBuckets>();
    for (const cycle of cycles) {
      buckets.set(cycle.id, emptyGenderBuckets());
    }
    for (const participation of participations) {
      const bucket = buckets.get(participation.cycleId);
      if (!bucket) continue;
      addGender(
        bucket,
        resolveHardGender(participation.user.questionnaireResponse),
      );
    }

    const result: WeeklyOptinCycle[] = [...cycles].reverse().map((cycle) => {
      const b = buckets.get(cycle.id) ?? emptyGenderBuckets();
      const total = b.male + b.female + b.nonBinary + b.unknown;
      const maleFemaleTotal = b.male + b.female;
      return {
        cycleId: cycle.id,
        codename: cycle.codename,
        revealAt: cycle.revealAt.toISOString(),
        status: cycle.status,
        optedIn: { ...b, total },
        femaleShare: maleFemaleTotal === 0 ? null : b.female / maleFemaleTotal,
      };
    });

    return { cycles: result, includeTest };
  }

  async matchLeaderboard(
    query: MatchLeaderboardQueryDto,
  ): Promise<MatchLeaderboardResponse> {
    const includeTest = query.includeTest === true;
    const sort: LeaderboardSortKey = query.sort ?? 'unmatchedStreak';
    const order: 'asc' | 'desc' = query.order ?? 'desc';
    const limit = query.limit ?? 50;
    const userFilter = includeTest ? {} : { isTest: false };

    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        status: 'OPTED_IN',
        intent: { not: null },
        cycle: { status: 'REVEALED' },
        user: userFilter,
      },
      select: {
        userId: true,
        cycleId: true,
        updatedAt: true,
        cycle: { select: { revealAt: true, createdAt: true } },
        user: {
          select: {
            displayName: true,
            email: true,
            school: { select: { name: true } },
            questionnaireResponse: {
              select: { submittedAt: true, answers: true },
            },
          },
        },
      },
      orderBy: [
        { userId: 'asc' },
        { cycle: { revealAt: 'desc' } },
        { cycle: { createdAt: 'desc' } },
        { updatedAt: 'desc' },
      ],
    });

    const cycleIds = Array.from(
      new Set(participations.map((participation) => participation.cycleId)),
    );
    const userIds = Array.from(
      new Set(participations.map((participation) => participation.userId)),
    );
    const matched =
      cycleIds.length > 0 && userIds.length > 0
        ? await this.prisma.matchParticipant.findMany({
            where: { cycleId: { in: cycleIds }, userId: { in: userIds } },
            select: { userId: true, cycleId: true },
          })
        : [];
    const matchedKeys = new Set(
      matched.map((match) => `${match.userId}::${match.cycleId}`),
    );

    interface Accumulator {
      userId: string;
      displayName: string | null;
      email: string;
      schoolName: string | null;
      gender: ReturnType<typeof genderKey>;
      outcomes: UserCycleOutcome[];
    }
    const byUser = new Map<string, Accumulator>();

    for (const participation of participations) {
      let acc = byUser.get(participation.userId);
      if (!acc) {
        acc = {
          userId: participation.userId,
          displayName: participation.user.displayName,
          email: participation.user.email,
          schoolName: participation.user.school?.name ?? null,
          gender: genderKey(
            resolveHardGender(participation.user.questionnaireResponse),
          ),
          outcomes: [],
        };
        byUser.set(participation.userId, acc);
      }
      acc.outcomes.push({
        cycleId: participation.cycleId,
        revealAt: participation.cycle.revealAt,
        cycleCreatedAt: participation.cycle.createdAt,
        participationUpdatedAt: participation.updatedAt,
        matched: matchedKeys.has(
          `${participation.userId}::${participation.cycleId}`,
        ),
      });
    }

    const male: LeaderboardRow[] = [];
    const female: LeaderboardRow[] = [];
    for (const acc of byUser.values()) {
      if (acc.gender !== 'male' && acc.gender !== 'female') continue;
      const metrics = computeLeaderboardMetrics(acc.outcomes);
      const row: LeaderboardRow = {
        userId: acc.userId,
        displayName: acc.displayName,
        email: acc.email,
        schoolName: acc.schoolName,
        ...metrics,
      };
      (acc.gender === 'male' ? male : female).push(row);
    }

    const field = SORT_FIELD[sort];
    const sortRows = (rows: LeaderboardRow[]) =>
      rows
        .sort((a, b) => {
          const av = (a[field] as number | null) ?? 0;
          const bv = (b[field] as number | null) ?? 0;
          if (av !== bv) return order === 'asc' ? av - bv : bv - av;
          if (a.optInRounds !== b.optInRounds) {
            return b.optInRounds - a.optInRounds;
          }
          return (a.displayName ?? a.email).localeCompare(
            b.displayName ?? b.email,
          );
        })
        .slice(0, limit);

    return {
      male: sortRows(male),
      female: sortRows(female),
      sort,
      order,
      limit,
      includeTest,
    };
  }
}
