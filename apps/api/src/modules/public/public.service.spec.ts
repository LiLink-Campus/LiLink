import { PublicService } from './public.service';

describe('PublicService', () => {
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
});
