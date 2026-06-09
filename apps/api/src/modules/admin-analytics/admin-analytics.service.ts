import { Injectable } from '@nestjs/common';
import {
  HARD_MATCH_KEYS,
  type ProductEventKind,
  type ProductEventName,
} from '@lilink/shared';
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
  ProductAnalyticsQueryDto,
  ProductAnalyticsRangeKey,
  WeeklyOptinQueryDto,
} from './dto/analytics-query.dto';
import {
  computeLeaderboardMetrics,
  UserCycleOutcome,
} from './leaderboard-metrics';

interface SchoolGenderRow extends GenderBuckets {
  schoolId: string | null;
  schoolName: string;
  total: number;
}

export interface SchoolsGenderResponse {
  schools: SchoolGenderRow[];
  totals: GenderBuckets & { total: number };
  includeTest: boolean;
}

interface WeeklyOptinCycle {
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

interface LeaderboardRow {
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

interface ProductAnalyticsKpis {
  activeUsers: number;
  totalEvents: number;
  todayEvents: number;
  couponRedeemRate: number | null;
  meetupCompletionRate: number | null;
  optinRate: null;
}

interface ProductAnalyticsFunnelStep {
  key: string;
  label: string;
  eventName: ProductEventName;
  value: number;
  kind: Extract<ProductEventKind, 'footprint' | 'intent' | 'outcome'>;
}

interface ProductAnalyticsFunnel {
  key: string;
  title: string;
  description: string;
  steps: ProductAnalyticsFunnelStep[];
}

interface ProductAnalyticsMissing {
  key: string;
  label: string;
  reason: string;
}

export interface ProductAnalyticsResponse {
  range: ProductAnalyticsRangeKey;
  since: string;
  until: string;
  includeTest: boolean;
  kpis: ProductAnalyticsKpis;
  funnels: ProductAnalyticsFunnel[];
  missing: ProductAnalyticsMissing[];
}

const SORT_FIELD: Record<LeaderboardSortKey, keyof LeaderboardRow> = {
  unmatchedStreak: 'currentUnmatchedStreak',
  matchStreak: 'currentMatchStreak',
  matchRate: 'matchRate',
  matchedRounds: 'matchedRounds',
  optInRounds: 'optInRounds',
};

const DAY_MS = 24 * 60 * 60 * 1000;

const PRODUCT_ANALYTICS_RANGE_DAYS: Record<ProductAnalyticsRangeKey, number> = {
  '7d': 7,
  '30d': 30,
  '60d': 60,
};

type ProductFunnelStepDefinition = Omit<ProductAnalyticsFunnelStep, 'value'>;

type ProductFunnelDefinition = Omit<ProductAnalyticsFunnel, 'steps'> & {
  steps: ProductFunnelStepDefinition[];
};

const PRODUCT_FUNNEL_DEFINITIONS: ProductFunnelDefinition[] = [
  {
    key: 'match',
    title: '匹配触达漏斗',
    description: '从首页浏览到匹配联系方式申请结果。',
    steps: [
      {
        key: 'dashboard',
        label: '首页浏览',
        eventName: 'dashboard_page_viewed',
        kind: 'footprint',
      },
      {
        key: 'matchView',
        label: '匹配页浏览',
        eventName: 'match_page_viewed',
        kind: 'footprint',
      },
      {
        key: 'contactClick',
        label: '联系方式点击',
        eventName: 'match_contact_request_clicked',
        kind: 'intent',
      },
      {
        key: 'contactRequested',
        label: '联系方式申请结果',
        eventName: 'match_contact_requested',
        kind: 'outcome',
      },
    ],
  },
  {
    key: 'coupon',
    title: '优惠券漏斗',
    description: '从优惠券页曝光到完成兑换的转化。',
    steps: [
      {
        key: 'view',
        label: '优惠券页浏览',
        eventName: 'coupon_page_viewed',
        kind: 'footprint',
      },
      {
        key: 'open',
        label: '点击取码',
        eventName: 'coupon_redeem_code_open_clicked',
        kind: 'intent',
      },
      {
        key: 'display',
        label: '兑换码展示',
        eventName: 'coupon_redeem_code_displayed',
        kind: 'footprint',
      },
      {
        key: 'redeemed',
        label: '完成兑换',
        eventName: 'coupon_redeemed',
        kind: 'outcome',
      },
    ],
  },
  {
    key: 'meetup',
    title: '约见漏斗',
    description: '从约见入口到最终确认的意图与结果。',
    steps: [
      {
        key: 'entry',
        label: '约见入口点击',
        eventName: 'meetup_entry_clicked',
        kind: 'intent',
      },
      {
        key: 'flow',
        label: '约见流程曝光',
        eventName: 'meetup_flow_viewed',
        kind: 'footprint',
      },
      {
        key: 'sessionCreated',
        label: '会话创建',
        eventName: 'meetup_session_created',
        kind: 'outcome',
      },
      {
        key: 'proposalClick',
        label: '提交提案点击',
        eventName: 'meetup_proposal_submit_clicked',
        kind: 'intent',
      },
      {
        key: 'proposalCreated',
        label: '提案创建',
        eventName: 'meetup_proposal_created',
        kind: 'outcome',
      },
      {
        key: 'optionClick',
        label: '接受选项点击',
        eventName: 'meetup_option_accept_clicked',
        kind: 'intent',
      },
      {
        key: 'optionAccepted',
        label: '选项接受',
        eventName: 'meetup_option_accepted',
        kind: 'outcome',
      },
      {
        key: 'confirmClick',
        label: '最终确认点击',
        eventName: 'meetup_final_confirm_clicked',
        kind: 'intent',
      },
      {
        key: 'confirmed',
        label: '最终确认',
        eventName: 'meetup_final_confirmed',
        kind: 'outcome',
      },
    ],
  },
];

const PRODUCT_ANALYTICS_EVENT_NAMES = Array.from(
  new Set(
    PRODUCT_FUNNEL_DEFINITIONS.flatMap((funnel) =>
      funnel.steps.map((step) => step.eventName),
    ),
  ),
);

const PRODUCT_ANALYTICS_MISSING: ProductAnalyticsMissing[] = [
  {
    key: 'optinConversion',
    label: '报名转化率',
    reason:
      '现有 ProductEvent 没有报名入口曝光和报名提交事件；运营报名结果已在每周报名趋势中展示，但不能算产品漏斗转化。',
  },
  {
    key: 'trendDeltas',
    label: 'KPI 环比趋势',
    reason: '当前接口聚合选定时间窗的实时计数，尚未接上一时间窗对比。',
  },
];

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async productFunnels(
    query: ProductAnalyticsQueryDto,
  ): Promise<ProductAnalyticsResponse> {
    const includeTest = query.includeTest === true;
    const range = query.range ?? '7d';
    const until = new Date();
    const since = new Date(
      until.getTime() - PRODUCT_ANALYTICS_RANGE_DAYS[range] * DAY_MS,
    );
    const todayStart = startOfLocalDay(until);
    const testFilter = includeTest
      ? Prisma.empty
      : Prisma.sql`AND (pe."userId" IS NULL OR u."isTest" = false)`;

    const [eventRows, activeUserRows, totalRows, todayRows] = await Promise.all(
      [
        this.prisma.$queryRaw<Array<{ name: string; count: bigint | number }>>(
          Prisma.sql`
            SELECT pe."name" AS "name", COUNT(*)::int AS "count"
            FROM "ProductEvent" pe
            LEFT JOIN "User" u ON u."id" = pe."userId"
            WHERE COALESCE(pe."occurredAt", pe."createdAt") >= ${since}
              AND COALESCE(pe."occurredAt", pe."createdAt") < ${until}
              AND pe."name" IN (${Prisma.join(PRODUCT_ANALYTICS_EVENT_NAMES)})
              ${testFilter}
            GROUP BY pe."name"
          `,
        ),
        this.prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
          SELECT COUNT(DISTINCT pe."userId")::int AS "count"
          FROM "ProductEvent" pe
          LEFT JOIN "User" u ON u."id" = pe."userId"
          WHERE COALESCE(pe."occurredAt", pe."createdAt") >= ${since}
            AND COALESCE(pe."occurredAt", pe."createdAt") < ${until}
            AND pe."userId" IS NOT NULL
            ${testFilter}
        `),
        this.prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS "count"
          FROM "ProductEvent" pe
          LEFT JOIN "User" u ON u."id" = pe."userId"
          WHERE COALESCE(pe."occurredAt", pe."createdAt") >= ${since}
            AND COALESCE(pe."occurredAt", pe."createdAt") < ${until}
            ${testFilter}
        `),
        this.prisma.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS "count"
          FROM "ProductEvent" pe
          LEFT JOIN "User" u ON u."id" = pe."userId"
          WHERE COALESCE(pe."occurredAt", pe."createdAt") >= ${todayStart}
            AND COALESCE(pe."occurredAt", pe."createdAt") < ${until}
            ${testFilter}
        `),
      ],
    );

    const countByName = new Map(
      eventRows.map((row) => [row.name, toNumber(row.count)]),
    );
    const count = (name: ProductEventName) => countByName.get(name) ?? 0;
    const funnels = PRODUCT_FUNNEL_DEFINITIONS.map((funnel) => ({
      ...funnel,
      steps: funnel.steps.map((step) => ({
        ...step,
        value: count(step.eventName),
      })),
    }));

    return {
      range,
      since: since.toISOString(),
      until: until.toISOString(),
      includeTest,
      kpis: {
        activeUsers: firstCount(activeUserRows),
        totalEvents: firstCount(totalRows),
        todayEvents: firstCount(todayRows),
        couponRedeemRate: ratio(
          count('coupon_redeemed'),
          count('coupon_page_viewed'),
        ),
        meetupCompletionRate: ratio(
          count('meetup_final_confirmed'),
          count('meetup_entry_clicked'),
        ),
        optinRate: null,
      },
      funnels,
      missing: PRODUCT_ANALYTICS_MISSING.map((item) => ({ ...item })),
    };
  }

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
    const limit = query.limit ?? 10;
    // Deactivated (SUSPENDED) users are hidden from the leaderboard even though
    // their historical participations stay in the data. isTest filtering still
    // follows the includeTest toggle.
    const userFilter: Prisma.UserWhereInput = {
      status: { not: 'SUSPENDED' },
      ...(includeTest ? {} : { isTest: false }),
    };

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

function startOfLocalDay(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}

function firstCount(rows: Array<{ count: bigint | number }>) {
  return toNumber(rows[0]?.count);
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return null;
  return numerator / denominator;
}
