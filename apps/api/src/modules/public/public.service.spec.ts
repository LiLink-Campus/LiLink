import { PublicService } from './public.service';

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
});
