import { HARD_MATCH_KEYS } from '@lilink/shared';
import { AdminAnalyticsService } from './admin-analytics.service';

function makePrisma() {
  return {
    user: { findMany: jest.fn() },
    matchCycle: { findMany: jest.fn() },
    cycleParticipation: { findMany: jest.fn() },
    matchParticipant: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
}

const submitted = new Date('2026-05-10T00:00:00.000Z');
const male = {
  submittedAt: submitted,
  answers: { [HARD_MATCH_KEYS.gender]: '男' },
};
const female = {
  submittedAt: submitted,
  answers: { [HARD_MATCH_KEYS.gender]: '女' },
};

describe('AdminAnalyticsService.productFunnels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-30T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates live ProductEvent counts into KPIs, funnels, and known gaps', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { name: 'dashboard_page_viewed', count: 4 },
        { name: 'match_page_viewed', count: 3 },
        { name: 'match_contact_request_clicked', count: 1 },
        { name: 'coupon_page_viewed', count: 5 },
        { name: 'coupon_redeem_code_open_clicked', count: 3 },
        { name: 'coupon_redeem_code_displayed', count: 3 },
        { name: 'coupon_redeemed', count: 2 },
        { name: 'meetup_entry_clicked', count: 4 },
        { name: 'meetup_final_confirmed', count: 1 },
      ])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 18 }])
      .mockResolvedValueOnce([{ count: 6 }]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.productFunnels({ range: '7d' });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      range: '7d',
      since: '2026-05-23T12:00:00.000Z',
      until: '2026-05-30T12:00:00.000Z',
      includeTest: false,
      kpis: {
        activeUsers: 2,
        totalEvents: 18,
        todayEvents: 6,
        couponRedeemRate: 2 / 5,
        meetupCompletionRate: 1 / 4,
        optinRate: null,
      },
    });
    expect(result.funnels.map((funnel) => funnel.key)).toEqual([
      'match',
      'coupon',
      'meetup',
    ]);
    expect(result.funnels[0].steps.map((step) => step.value)).toEqual([
      4, 3, 1, 0,
    ]);
    expect(result.funnels[1].steps.map((step) => step.value)).toEqual([
      5, 3, 3, 2,
    ]);
    expect(result.missing.map((item) => item.key)).toEqual([
      'optinConversion',
      'trendDeltas',
    ]);
  });

  it('returns null rates when funnel denominators are zero', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.productFunnels({ range: '60d' });

    expect(result.range).toBe('60d');
    expect(result.since).toBe('2026-03-31T12:00:00.000Z');
    expect(result.kpis.couponRedeemRate).toBeNull();
    expect(result.kpis.meetupCompletionRate).toBeNull();
    expect(result.funnels[1].steps.every((step) => step.value === 0)).toBe(
      true,
    );
  });
});

describe('AdminAnalyticsService.getSchoolsGender', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups users by school with gender buckets and totals, sorted by total desc', async () => {
    const prisma = makePrisma();
    // schoolsGender aggregates (school, gender) counts in SQL; the mock returns
    // one row per bucket (raw hard-match gender string, or null = unknown).
    prisma.$queryRaw.mockResolvedValue([
      { schoolId: 's1', schoolName: 'Alpha', gender: '男', count: 1 },
      { schoolId: 's1', schoolName: 'Alpha', gender: '女', count: 1 },
      { schoolId: 's1', schoolName: 'Alpha', gender: null, count: 1 },
      { schoolId: 's2', schoolName: 'Beta', gender: '男', count: 1 },
      { schoolId: null, schoolName: null, gender: '女', count: 1 },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.schoolsGender({});

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result.schools[0]).toEqual({
      schoolId: 's1',
      schoolName: 'Alpha',
      male: 1,
      female: 1,
      nonBinary: 0,
      unknown: 1,
      total: 3,
    });
    expect(result.schools).toHaveLength(3);
    const noSchool = result.schools.find((s) => s.schoolId === null);
    expect(noSchool).toMatchObject({
      schoolName: '（未分配学校）',
      female: 1,
      total: 1,
    });
    expect(result.totals).toEqual({
      male: 2,
      female: 2,
      nonBinary: 0,
      unknown: 1,
      total: 5,
    });
    expect(result.includeTest).toBe(false);
  });

  it('includes test users when includeTest=true', async () => {
    const prisma = makePrisma();
    prisma.$queryRaw.mockResolvedValue([]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.schoolsGender({ includeTest: true });

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result.includeTest).toBe(true);
  });
});

describe('AdminAnalyticsService.weeklyOptin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns per-cycle gender buckets ascending by revealAt with femaleShare', async () => {
    const prisma = makePrisma();
    prisma.matchCycle.findMany.mockResolvedValue([
      {
        id: 'c2',
        codename: 'W2',
        revealAt: new Date('2026-05-15T00:00:00.000Z'),
        status: 'OPEN',
      },
      {
        id: 'c1',
        codename: 'W1',
        revealAt: new Date('2026-05-08T00:00:00.000Z'),
        status: 'REVEALED',
      },
    ]);
    // weeklyOptin aggregates (cycle, gender) opt-in counts in SQL.
    prisma.$queryRaw.mockResolvedValue([
      { cycleId: 'c1', gender: '男', count: 1 },
      { cycleId: 'c1', gender: '女', count: 2 },
      { cycleId: 'c2', gender: '男', count: 1 },
      { cycleId: 'c2', gender: null, count: 1 },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.weeklyOptin({ limit: 12 });

    expect(prisma.matchCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { revealAt: 'desc' },
        take: 12,
      }),
    );
    expect(result.cycles.map((c) => c.cycleId)).toEqual(['c1', 'c2']);
    expect(result.cycles[0]).toMatchObject({
      cycleId: 'c1',
      codename: 'W1',
      optedIn: { male: 1, female: 2, nonBinary: 0, unknown: 0, total: 3 },
      femaleShare: 2 / 3,
    });
    expect(result.cycles[1]).toMatchObject({
      cycleId: 'c2',
      optedIn: { male: 1, female: 0, nonBinary: 0, unknown: 1, total: 2 },
      femaleShare: 0,
    });
  });

  it('femaleShare is null when no male/female opt-ins', async () => {
    const prisma = makePrisma();
    prisma.matchCycle.findMany.mockResolvedValue([
      {
        id: 'c1',
        codename: 'W1',
        revealAt: new Date('2026-05-08T00:00:00.000Z'),
        status: 'REVEALED',
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      { cycleId: 'c1', gender: null, count: 1 },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.weeklyOptin({});

    expect(result.cycles[0].femaleShare).toBeNull();
    expect(prisma.matchCycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 12 }),
    );
  });
});

describe('AdminAnalyticsService.matchLeaderboard', () => {
  beforeEach(() => jest.clearAllMocks());

  function partic(
    userId: string,
    cycleId: string,
    day: number,
    user: {
      questionnaireResponse: unknown;
      displayName?: string;
      email?: string;
      school?: { name: string } | null;
    },
  ) {
    const d = new Date(2026, 0, day);
    return {
      userId,
      cycleId,
      updatedAt: d,
      cycle: { revealAt: d, createdAt: d },
      user: {
        displayName: user.displayName ?? userId,
        email: user.email ?? `${userId}@e.com`,
        school: user.school ?? null,
        questionnaireResponse: user.questionnaireResponse,
      },
    };
  }

  it('splits male/female, computes metrics, sorts by unmatchedStreak desc by default', async () => {
    const prisma = makePrisma();
    prisma.cycleParticipation.findMany.mockResolvedValue([
      partic('u1', 'c1', 1, { questionnaireResponse: male }),
      partic('u1', 'c2', 2, { questionnaireResponse: male }),
      partic('u2', 'c1', 1, { questionnaireResponse: male }),
      partic('u2', 'c2', 2, { questionnaireResponse: male }),
      partic('u3', 'c1', 1, {
        questionnaireResponse: female,
        school: { name: 'Alpha' },
      }),
    ]);
    prisma.matchParticipant.findMany.mockResolvedValue([
      { userId: 'u1', cycleId: 'c1' },
      { userId: 'u3', cycleId: 'c1' },
    ]);
    // Identity + gender are now resolved once per user, not per participation.
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        displayName: 'u1',
        email: 'u1@e.com',
        school: null,
        questionnaireResponse: male,
      },
      {
        id: 'u2',
        displayName: 'u2',
        email: 'u2@e.com',
        school: null,
        questionnaireResponse: male,
      },
      {
        id: 'u3',
        displayName: 'u3',
        email: 'u3@e.com',
        school: { name: 'Alpha' },
        questionnaireResponse: female,
      },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.matchLeaderboard({});

    expect(prisma.cycleParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'OPTED_IN',
          intent: { not: null },
          cycle: { status: 'REVEALED' },
          user: { isTest: false },
        },
      }),
    );
    expect(prisma.matchParticipant.findMany).toHaveBeenCalledWith({
      where: {
        cycleId: { in: ['c1', 'c2'] },
        userId: { in: ['u1', 'u2', 'u3'] },
      },
      select: { userId: true, cycleId: true },
    });
    expect(result.male.map((r) => r.userId)).toEqual(['u2', 'u1']);
    expect(result.male[0]).toMatchObject({
      userId: 'u2',
      optInRounds: 2,
      matchedRounds: 0,
      matchRate: 0,
      currentUnmatchedStreak: 2,
      currentMatchStreak: 0,
    });
    expect(result.male[1]).toMatchObject({
      userId: 'u1',
      optInRounds: 2,
      matchedRounds: 1,
      currentUnmatchedStreak: 1,
    });
    expect(result.female.map((r) => r.userId)).toEqual(['u3']);
    expect(result.female[0]).toMatchObject({
      schoolName: 'Alpha',
      matchedRounds: 1,
      currentMatchStreak: 1,
      matchRate: 1,
    });
    expect(result).toMatchObject({
      sort: 'unmatchedStreak',
      order: 'desc',
      limit: 50,
      includeTest: false,
    });
  });

  it('honors sort=matchedRounds order=desc and limit', async () => {
    const prisma = makePrisma();
    prisma.cycleParticipation.findMany.mockResolvedValue([
      partic('u1', 'c1', 1, { questionnaireResponse: male }),
      partic('u2', 'c1', 1, { questionnaireResponse: male }),
    ]);
    prisma.matchParticipant.findMany.mockResolvedValue([
      { userId: 'u2', cycleId: 'c1' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        displayName: 'u1',
        email: 'u1@e.com',
        school: null,
        questionnaireResponse: male,
      },
      {
        id: 'u2',
        displayName: 'u2',
        email: 'u2@e.com',
        school: null,
        questionnaireResponse: male,
      },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.matchLeaderboard({
      sort: 'matchedRounds',
      order: 'desc',
      limit: 1,
    });

    expect(result.male).toHaveLength(1);
    expect(result.male[0].userId).toBe('u2');
  });

  it('excludes nonBinary/unknown users from both gendered lists', async () => {
    const prisma = makePrisma();
    prisma.cycleParticipation.findMany.mockResolvedValue([
      partic('u9', 'c1', 1, { questionnaireResponse: null }),
    ]);
    prisma.matchParticipant.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u9',
        displayName: 'u9',
        email: 'u9@e.com',
        school: null,
        questionnaireResponse: null,
      },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.matchLeaderboard({});

    expect(result.male).toHaveLength(0);
    expect(result.female).toHaveLength(0);
  });
});
