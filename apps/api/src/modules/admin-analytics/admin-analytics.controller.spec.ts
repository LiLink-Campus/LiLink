import { AdminAnalyticsController } from './admin-analytics.controller';

describe('AdminAnalyticsController', () => {
  it('can be constructed with the service dependency', () => {
    const controller = new AdminAnalyticsController({} as never);

    expect(controller).toBeInstanceOf(AdminAnalyticsController);
  });

  it('forwards schools-gender requests to AdminAnalyticsService', async () => {
    const service = {
      schoolsGender: jest.fn().mockResolvedValue({
        schools: [],
        totals: { male: 0, female: 0, nonBinary: 0, unknown: 0, total: 0 },
        includeTest: false,
      }),
    };
    const controller = new AdminAnalyticsController(service as never);
    const query = { includeTest: false };

    await expect(controller.schoolsGender(query)).resolves.toEqual({
      schools: [],
      totals: { male: 0, female: 0, nonBinary: 0, unknown: 0, total: 0 },
      includeTest: false,
    });
    expect(service.schoolsGender).toHaveBeenCalledWith(query);
  });

  it('forwards product-funnels requests to AdminAnalyticsService', async () => {
    const service = {
      productFunnels: jest.fn().mockResolvedValue({
        range: '7d',
        since: '2026-05-23T00:00:00.000Z',
        until: '2026-05-30T00:00:00.000Z',
        includeTest: false,
        kpis: {
          activeUsers: 0,
          totalEvents: 0,
          todayEvents: 0,
          couponRedeemRate: null,
          meetupCompletionRate: null,
          optinRate: null,
        },
        funnels: [],
        missing: [],
      }),
    };
    const controller = new AdminAnalyticsController(service as never);
    const query = { range: '30d' as const, includeTest: true };

    await expect(controller.productFunnels(query)).resolves.toEqual({
      range: '7d',
      since: '2026-05-23T00:00:00.000Z',
      until: '2026-05-30T00:00:00.000Z',
      includeTest: false,
      kpis: {
        activeUsers: 0,
        totalEvents: 0,
        todayEvents: 0,
        couponRedeemRate: null,
        meetupCompletionRate: null,
        optinRate: null,
      },
      funnels: [],
      missing: [],
    });
    expect(service.productFunnels).toHaveBeenCalledWith(query);
  });

  it('forwards weekly-optin requests to AdminAnalyticsService', async () => {
    const service = {
      weeklyOptin: jest.fn().mockResolvedValue({
        cycles: [],
        includeTest: false,
      }),
    };
    const controller = new AdminAnalyticsController(service as never);
    const query = { limit: 8, includeTest: true };

    await expect(controller.weeklyOptin(query)).resolves.toEqual({
      cycles: [],
      includeTest: false,
    });
    expect(service.weeklyOptin).toHaveBeenCalledWith(query);
  });

  it('forwards match-leaderboard requests to AdminAnalyticsService', async () => {
    const service = {
      matchLeaderboard: jest.fn().mockResolvedValue({
        male: [],
        female: [],
        sort: 'unmatchedStreak',
        order: 'desc',
        limit: 50,
        includeTest: false,
      }),
    };
    const controller = new AdminAnalyticsController(service as never);
    const query = { sort: 'matchedRounds' as const, order: 'asc' as const };

    await expect(controller.matchLeaderboard(query)).resolves.toEqual({
      male: [],
      female: [],
      sort: 'unmatchedStreak',
      order: 'desc',
      limit: 50,
      includeTest: false,
    });
    expect(service.matchLeaderboard).toHaveBeenCalledWith(query);
  });
});
