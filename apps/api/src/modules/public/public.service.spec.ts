import { PublicService } from './public.service';

describe('PublicService', () => {
  it('counts only revealed and introduced matches for the landing stats', async () => {
    const matchCount = jest.fn().mockResolvedValue(12);
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(100),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 80 }]),
      match: {
        count: matchCount,
      },
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PublicService(prisma as never);

    await expect(service.getLandingPayload()).resolves.toMatchObject({
      stats: {
        matchesDelivered: 12,
      },
    });

    expect(matchCount).toHaveBeenCalledWith({
      where: {
        revealedAt: { not: null },
        introducedAt: { not: null },
        participants: {
          some: {},
          every: {
            user: { status: 'ACTIVE', deactivatedAt: null, isTest: false },
          },
        },
      },
    });
  });

  it('reuses the cached landing payload within the TTL window', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(85),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 64 }]),
      match: {
        count: jest.fn().mockResolvedValue(15),
      },
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          codename: '第三周',
          revealAt: new Date('2026-04-28T13:00:00.000Z'),
          participationDeadline: new Date('2026-04-28T11:00:00.000Z'),
        }),
      },
    };
    const service = new PublicService(prisma as never);

    await expect(service.getLandingPayload()).resolves.toMatchObject({
      brand: 'LiLink',
      stats: {
        registeredUsers: 85,
        completedQuestionnaires: 64,
        matchesDelivered: 15,
      },
      currentCycle: {
        codename: '第三周',
      },
    });
    await expect(service.getLandingPayload()).resolves.toMatchObject({
      brand: 'LiLink',
      stats: {
        registeredUsers: 85,
        completedQuestionnaires: 64,
        matchesDelivered: 15,
      },
      currentCycle: {
        codename: '第三周',
      },
    });

    expect(prisma.user.count).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.match.count).toHaveBeenCalledTimes(1);
    expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(1);
  });

  it('does not let an invalidated in-flight landing request replace or detach a newer load', async () => {
    type Cycle = {
      codename: string;
      revealAt: Date;
      participationDeadline: Date;
    };
    let finishOld!: (cycle: Cycle | null) => void;
    let finishNew!: (cycle: Cycle | null) => void;
    const oldLoad = new Promise<Cycle | null>((resolve) => {
      finishOld = resolve;
    });
    const newLoad = new Promise<Cycle | null>((resolve) => {
      finishNew = resolve;
    });
    const prisma = {
      user: { count: jest.fn().mockResolvedValue(85) },
      $queryRaw: jest.fn().mockResolvedValue([{ count: 64 }]),
      match: { count: jest.fn().mockResolvedValue(15) },
      matchCycle: {
        findFirst: jest
          .fn()
          .mockReturnValueOnce(oldLoad)
          .mockReturnValueOnce(newLoad),
      },
    };
    const service = new PublicService(prisma as never);
    const staleRequest = service.getLandingPayload();
    service.invalidateLandingCache();
    const freshRequest = service.getLandingPayload();
    finishOld(null);
    await staleRequest;
    const concurrentRequest = service.getLandingPayload();
    expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(2);

    const cycle = {
      codename: '第12周',
      revealAt: new Date('2026-09-29T13:00:00Z'),
      participationDeadline: new Date('2026-09-29T11:00:00Z'),
    };
    finishNew(cycle);
    for (const request of [freshRequest, concurrentRequest]) {
      await expect(request).resolves.toMatchObject({ currentCycle: cycle });
    }
    await expect(service.getLandingPayload()).resolves.toMatchObject({
      currentCycle: cycle,
    });
    expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(2);
  });

  describe('getEligibleSchools', () => {
    it('returns schools with their domains and aggregated counts', async () => {
      const findMany = jest.fn<
        Promise<
          Array<{
            id: string;
            name: string;
            description: string | null;
            domains: Array<{ domain: string }>;
          }>
        >,
        [{ where?: unknown; select?: unknown; orderBy?: unknown }]
      >();
      findMany.mockResolvedValue([
        {
          id: 'fudan',
          name: '复旦大学',
          description: 'fudan',
          domains: [
            { domain: 'cn' },
            { domain: 'fudan.edu.cn' },
            { domain: 'm.fudan.edu.cn' },
          ],
        },
        {
          id: 'sjtu',
          name: '上海交通大学',
          description: null,
          domains: [{ domain: 'sjtu.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      const payload = await service.getEligibleSchools();

      expect(payload.totalSchoolCount).toBe(2);
      expect(payload.totalDomainCount).toBe(2);
      // id is asserted explicitly: the manual-school dropdown uses school.id as
      // the <option value>, so a regression dropping it would silently break
      // non-edu registration.
      expect(payload.schools).toEqual([
        {
          id: 'fudan',
          name: '复旦大学',
          description: 'fudan',
          domains: ['fudan.edu.cn'],
        },
        {
          id: 'sjtu',
          name: '上海交通大学',
          description: null,
          domains: ['sjtu.edu.cn'],
        },
      ]);
      expect(payload.generatedAt).toBeInstanceOf(Date);

      // Only registration-eligible schools that have at least one domain are
      // returned, so the public list never shows an entry users cannot actually
      // use to register.
      const findManyArgs = findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({
        registrationEligible: true,
        domains: { some: {} },
      });
    });

    it('reuses the cached eligible schools payload within the TTL window', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          name: '复旦大学',
          description: null,
          domains: [{ domain: 'fudan.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      await service.getEligibleSchools();
      await service.getEligibleSchools();

      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('refetches after invalidateEligibleSchoolsCache, even within the TTL window', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          name: '复旦大学',
          description: null,
          domains: [{ domain: 'fudan.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      await service.getEligibleSchools();
      // An admin school mutation invalidates the cache; the next read must hit
      // the DB again rather than serving the stale within-TTL snapshot.
      service.invalidateEligibleSchoolsCache();
      await service.getEligibleSchools();

      expect(findMany).toHaveBeenCalledTimes(2);
    });
  });
});
