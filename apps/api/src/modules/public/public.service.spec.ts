import { PublicService } from './public.service';
import { PUBLIC_SUPPORTED_SCHOOL_SLUGS } from '@lilink/shared';

describe('PublicService', () => {
  it('counts only revealed matches for the landing stats', async () => {
    const matchCount = jest.fn().mockResolvedValue(12);
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(100),
      },
      questionnaireResponse: {
        count: jest.fn().mockResolvedValue(80),
      },
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
      },
    });
  });

  it('reuses the cached landing payload within the TTL window', async () => {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(85),
      },
      questionnaireResponse: {
        count: jest.fn().mockResolvedValue(64),
      },
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
    expect(prisma.questionnaireResponse.count).toHaveBeenCalledTimes(1);
    expect(prisma.match.count).toHaveBeenCalledTimes(1);
    expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(1);
  });

  describe('getEligibleSchools', () => {
    it('returns schools with their domains', async () => {
      const findMany = jest.fn<
        Promise<
          Array<{
            slug: string;
            domains: Array<{ domain: string }>;
          }>
        >,
        [{ where?: unknown; select?: unknown; orderBy?: unknown }]
      >();
      findMany.mockResolvedValue([
        {
          slug: 'cuc-hainan-international',
          domains: [{ domain: 'cuc.edu.cn' }, { domain: 'coventry.ac.uk' }],
        },
        {
          slug: 'bupt-qmul-hainan',
          domains: [{ domain: 'bupt.edu.cn' }],
        },
        {
          slug: 'unsupported-school',
          domains: [{ domain: 'unsupported.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      const payload = await service.getEligibleSchools();

      expect(payload.totalSchoolCount).toBe(2);
      expect(payload.totalDomainCount).toBe(3);
      expect(payload.schools).toEqual([
        {
          slug: 'bupt-qmul-hainan',
          name: '北京邮电大学',
          nativeName: '北京邮电大学',
          englishName: 'Beijing University of Posts and Telecommunications',
          baseName: '北京邮电大学',
          nativeBaseName: '北京邮电大学',
          englishBaseName: 'Beijing University of Posts and Telecommunications',
          domains: ['bupt.edu.cn'],
        },
        {
          slug: 'cuc-hainan-international',
          name: '中国传媒大学',
          nativeName: '中国传媒大学',
          englishName: 'Communication University of China',
          baseName: '中国传媒大学',
          nativeBaseName: '中国传媒大学',
          englishBaseName: 'Communication University of China',
          domains: ['cuc.edu.cn', 'coventry.ac.uk'],
        },
      ]);
      expect(payload.generatedAt).toBeInstanceOf(Date);

      // Schools without any domain are excluded so the public list never shows
      // an entry that users cannot actually use to register.
      const findManyArgs = findMany.mock.calls[0][0];
      expect(findManyArgs.where).toEqual({
        slug: { in: [...PUBLIC_SUPPORTED_SCHOOL_SLUGS] },
        domains: { some: {} },
      });
      expect(findManyArgs.select).not.toHaveProperty('_count');
      expect(findManyArgs.select).not.toHaveProperty('description');
    });

    it('localizes school display names per request locale', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          slug: 'bupt-qmul-hainan',
          domains: [{ domain: 'bupt.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      await expect(service.getEligibleSchools('en-US')).resolves.toMatchObject({
        schools: [
          {
            name: 'Beijing University of Posts and Telecommunications',
            baseName: 'Beijing University of Posts and Telecommunications',
            nativeName: '北京邮电大学',
          },
        ],
      });
    });

    it('reuses the cached eligible schools payload within the TTL window', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          slug: 'bupt-qmul-hainan',
          domains: [{ domain: 'bupt.edu.cn' }],
        },
      ]);
      const prisma = { school: { findMany } };
      const service = new PublicService(prisma as never);

      await service.getEligibleSchools();
      await service.getEligibleSchools();

      expect(findMany).toHaveBeenCalledTimes(1);
    });
  });
});
