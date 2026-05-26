import { Injectable } from '@nestjs/common';
import { HARD_MATCH_KEYS } from '@lilink/shared';
import {
  emptyGenderBuckets,
  GenderBuckets,
  genderKey,
  resolveHardGender,
} from '../../common/analytics/gender';
import { Prisma } from '../../common/prisma/client';
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
    // Aggregate (school, gender) counts in SQL so we transfer one row per
    // (school, gender) bucket instead of every user's full questionnaire JSON.
    // Authoritative gender = the trimmed hard-match answer of a *submitted*
    // questionnaire (LEFT JOIN gated on submittedAt), mirroring resolveHardGender.
    const rows = await this.prisma.$queryRaw<
      Array<{
        schoolId: string | null;
        schoolName: string | null;
        gender: string | null;
        count: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        base."schoolId" AS "schoolId",
        base."schoolName" AS "schoolName",
        base."gender" AS "gender",
        COUNT(*)::int AS "count"
      FROM (
        SELECT
          u."schoolId" AS "schoolId",
          s."name" AS "schoolName",
          TRIM(r."answers"->>${HARD_MATCH_KEYS.gender}) AS "gender"
        FROM "User" u
        LEFT JOIN "School" s ON s."id" = u."schoolId"
        LEFT JOIN "QuestionnaireResponse" r
          ON r."userId" = u."id" AND r."submittedAt" IS NOT NULL
        WHERE 1 = 1
          ${includeTest ? Prisma.empty : Prisma.sql`AND u."isTest" = false`}
      ) base
      GROUP BY base."schoolId", base."schoolName", base."gender"
    `);

    const noSchool = '__none__';
    const bySchool = new Map<
      string,
      { schoolId: string | null; schoolName: string; buckets: GenderBuckets }
    >();
    const totals = emptyGenderBuckets();

    for (const row of rows) {
      const schoolKey = row.schoolId ?? noSchool;
      let entry = bySchool.get(schoolKey);
      if (!entry) {
        entry = {
          schoolId: row.schoolId,
          schoolName: row.schoolName ?? '（未分配学校）',
          buckets: emptyGenderBuckets(),
        };
        bySchool.set(schoolKey, entry);
      }

      const key = genderKey(row.gender);
      const count = Number(row.count);
      entry.buckets[key] += count;
      totals[key] += count;
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
    // Aggregate opted-in (cycle, gender) counts in SQL instead of pulling every
    // participant's questionnaire JSON across the recent cycles.
    const rows =
      cycleIds.length > 0
        ? await this.prisma.$queryRaw<
            Array<{
              cycleId: string;
              gender: string | null;
              count: bigint | number;
            }>
          >(Prisma.sql`
            SELECT
              base."cycleId" AS "cycleId",
              base."gender" AS "gender",
              COUNT(*)::int AS "count"
            FROM (
              SELECT
                cp."cycleId" AS "cycleId",
                TRIM(r."answers"->>${HARD_MATCH_KEYS.gender}) AS "gender"
              FROM "CycleParticipation" cp
              JOIN "User" u ON u."id" = cp."userId"
              LEFT JOIN "QuestionnaireResponse" r
                ON r."userId" = cp."userId" AND r."submittedAt" IS NOT NULL
              WHERE cp."cycleId" IN (${Prisma.join(cycleIds)})
                AND cp."status" = 'OPTED_IN'
                AND cp."intent" IS NOT NULL
                ${includeTest ? Prisma.empty : Prisma.sql`AND u."isTest" = false`}
            ) base
            GROUP BY base."cycleId", base."gender"
          `)
        : [];

    const buckets = new Map<string, GenderBuckets>();
    for (const cycle of cycles) {
      buckets.set(cycle.id, emptyGenderBuckets());
    }
    for (const row of rows) {
      const bucket = buckets.get(row.cycleId);
      if (!bucket) continue;
      bucket[genderKey(row.gender)] += Number(row.count);
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

    // Streak metrics need every revealed participation, so this list cannot be
    // paginated — but it only needs scalar outcome fields. Identity + gender are
    // fetched once per user below instead of being duplicated on every row.
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
    const [matched, users] = await Promise.all([
      cycleIds.length > 0 && userIds.length > 0
        ? this.prisma.matchParticipant.findMany({
            where: { cycleId: { in: cycleIds }, userId: { in: userIds } },
            select: { userId: true, cycleId: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              displayName: true,
              email: true,
              school: { select: { name: true } },
              questionnaireResponse: {
                select: { submittedAt: true, answers: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const matchedKeys = new Set(
      matched.map((match) => `${match.userId}::${match.cycleId}`),
    );
    const identityByUserId = new Map(
      users.map((user) => [
        user.id,
        {
          displayName: user.displayName,
          email: user.email,
          schoolName: user.school?.name ?? null,
          gender: genderKey(resolveHardGender(user.questionnaireResponse)),
        },
      ]),
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
        const identity = identityByUserId.get(participation.userId);
        if (!identity) {
          continue;
        }
        acc = {
          userId: participation.userId,
          displayName: identity.displayName,
          email: identity.email,
          schoolName: identity.schoolName,
          gender: identity.gender,
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
