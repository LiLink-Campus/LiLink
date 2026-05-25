import { HARD_MATCH_KEYS } from '@lilink/shared';
import { AdminAnalyticsService } from './admin-analytics.service';

function makePrisma() {
  return {
    user: { findMany: jest.fn() },
    matchCycle: { findMany: jest.fn() },
    cycleParticipation: { findMany: jest.fn() },
    matchParticipant: { findMany: jest.fn() },
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

describe('AdminAnalyticsService.getSchoolsGender', () => {
  beforeEach(() => jest.clearAllMocks());

  it('groups users by school with gender buckets and totals, sorted by total desc', async () => {
    const prisma = makePrisma();
    prisma.user.findMany.mockResolvedValue([
      {
        schoolId: 's1',
        school: { name: 'Alpha' },
        questionnaireResponse: male,
      },
      {
        schoolId: 's1',
        school: { name: 'Alpha' },
        questionnaireResponse: female,
      },
      {
        schoolId: 's1',
        school: { name: 'Alpha' },
        questionnaireResponse: null,
      },
      {
        schoolId: 's2',
        school: { name: 'Beta' },
        questionnaireResponse: male,
      },
      { schoolId: null, school: null, questionnaireResponse: female },
    ]);
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.schoolsGender({});

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isTest: false } }),
    );
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
    prisma.user.findMany.mockResolvedValue([]);
    const service = new AdminAnalyticsService(prisma as never);

    await service.schoolsGender({ includeTest: true });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
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
    prisma.cycleParticipation.findMany.mockResolvedValue([
      { cycleId: 'c1', user: { questionnaireResponse: male } },
      { cycleId: 'c1', user: { questionnaireResponse: female } },
      { cycleId: 'c1', user: { questionnaireResponse: female } },
      { cycleId: 'c2', user: { questionnaireResponse: male } },
      { cycleId: 'c2', user: { questionnaireResponse: null } },
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
    prisma.cycleParticipation.findMany.mockResolvedValue([
      { cycleId: 'c1', user: { questionnaireResponse: null } },
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
    const service = new AdminAnalyticsService(prisma as never);

    const result = await service.matchLeaderboard({});

    expect(result.male).toHaveLength(0);
    expect(result.female).toHaveLength(0);
  });
});
