import { AdminAnalyticsController } from './admin-analytics.controller';

describe('AdminAnalyticsController', () => {
  it('can be constructed with the service dependency', () => {
    const controller = new AdminAnalyticsController({} as never);

    expect(controller).toBeInstanceOf(AdminAnalyticsController);
  });
});
