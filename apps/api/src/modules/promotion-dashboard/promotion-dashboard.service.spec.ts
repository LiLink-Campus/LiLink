import { HARD_MATCH_KEYS } from '@lilink/shared';
import { PromotionDashboardService } from './promotion-dashboard.service';

function makePrisma() {
  return {
    referralEvent: { count: jest.fn() },
    user: { findMany: jest.fn() },
    campaignActivation: { count: jest.fn() },
    coupon: { count: jest.fn() },
    redemption: { count: jest.fn(), findMany: jest.fn() },
    couponTemplate: { findMany: jest.fn() },
  };
}

const range = {
  campaignId: 'c1',
  from: '2026-05-01T00:00:00.000Z',
  to: '2026-06-01T00:00:00.000Z',
};

const submitted = new Date('2026-05-10T00:00:00.000Z');

describe('PromotionDashboardService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getFunnel', () => {
    it('returns steps + byGender (register cohort) + conversions for the campaign', async () => {
      const prisma = makePrisma();
      prisma.referralEvent.count
        .mockResolvedValueOnce(100) // SHARE
        .mockResolvedValueOnce(60); // CLICK
      prisma.user.findMany.mockResolvedValue([
        {
          questionnaireResponse: {
            submittedAt: submitted,
            answers: { [HARD_MATCH_KEYS.gender]: '男' },
          },
          campaignActivations: [{ id: 'a' }],
          coupons: [{ redemption: { id: 'r' } }],
        },
        {
          questionnaireResponse: {
            submittedAt: submitted,
            answers: { [HARD_MATCH_KEYS.gender]: '女' },
          },
          campaignActivations: [{ id: 'a' }],
          coupons: [{ redemption: null }],
        },
        {
          questionnaireResponse: null,
          campaignActivations: [],
          coupons: [],
        },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getFunnel({ ...range });

      expect(result.campaignId).toBe('c1');
      expect(result.steps).toEqual([
        { key: 'SHARE', count: 100 },
        { key: 'CLICK', count: 60 },
        { key: 'REGISTER', count: 3 },
        { key: 'ACTIVATE', count: 2 },
        { key: 'GRANT', count: 2 },
        { key: 'REDEEM', count: 1 },
      ]);
      expect(result.byGender[0]).toEqual({
        gender: '男',
        steps: [
          { key: 'REGISTER', count: 1 },
          { key: 'ACTIVATE', count: 1 },
          { key: 'GRANT', count: 1 },
          { key: 'REDEEM', count: 1 },
        ],
      });
      expect(result.conversions[0]).toEqual({
        from: 'SHARE',
        to: 'CLICK',
        rate: 0.6,
      });
    });

    it('rejects an invalid range (from >= to)', async () => {
      const prisma = makePrisma();
      const service = new PromotionDashboardService(prisma as never);
      await expect(
        service.getFunnel({ campaignId: 'c1', from: range.to, to: range.from }),
      ).rejects.toThrow(/before to/);
    });

    it('rejects a range exceeding the max span', async () => {
      const prisma = makePrisma();
      const service = new PromotionDashboardService(prisma as never);
      await expect(
        service.getFunnel({
          campaignId: 'c1',
          from: '2024-01-01T00:00:00.000Z',
          to: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/exceed/);
    });
  });

  describe('getLeaderboard', () => {
    it('aggregates personal-code referrers with full steps + gender, sorted by invited desc', async () => {
      const prisma = makePrisma();
      prisma.user.findMany.mockResolvedValue([
        {
          referredByUserId: 'r1',
          referredBy: { referralCode: 'CODE1', displayName: '小红' },
          inviteCodeId: null,
          inviteCode: null,
          questionnaireResponse: {
            submittedAt: submitted,
            answers: { [HARD_MATCH_KEYS.gender]: '男' },
          },
          campaignActivations: [{ id: 'a' }],
          coupons: [{ redemption: { id: 'x' } }],
        },
        {
          referredByUserId: 'r1',
          referredBy: { referralCode: 'CODE1', displayName: '小红' },
          inviteCodeId: null,
          inviteCode: null,
          questionnaireResponse: {
            submittedAt: submitted,
            answers: { [HARD_MATCH_KEYS.gender]: '女' },
          },
          campaignActivations: [],
          coupons: [],
        },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getLeaderboard({
        ...range,
        source: 'personal',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        sourceType: 'personal',
        refLabel: '小红',
        invited: 2,
        registered: 2,
        activated: 1,
        granted: 1,
        redeemed: 1,
        byGender: { male: 1, female: 1, nonBinary: 0, unknown: 0 },
      });
    });
  });

  describe('getCoupons', () => {
    it('groups by merchant and excludes test users in granted/redeemed', async () => {
      const prisma = makePrisma();
      prisma.couponTemplate.findMany.mockResolvedValue([
        { merchantId: 'm1', merchant: { name: 'Cafe' } },
      ]);
      prisma.coupon.count.mockResolvedValue(10);
      prisma.redemption.count.mockResolvedValue(3);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getCoupons({ ...range });

      expect(prisma.coupon.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { is: { isTest: false } },
            template: { is: { merchantId: 'm1', campaignId: 'c1' } },
          }) as object,
        }),
      );
      expect(result.items[0]).toEqual({
        merchantId: 'm1',
        merchantName: 'Cafe',
        granted: 10,
        redeemed: 3,
      });
    });
  });

  describe('getRedemptions', () => {
    it('groups by merchant + Shanghai day with faceValueTotal', async () => {
      const prisma = makePrisma();
      prisma.redemption.findMany.mockResolvedValue([
        {
          merchantId: 'm1',
          merchant: { name: 'Cafe' },
          redeemedAt: new Date('2026-05-31T18:00:00.000Z'),
          faceValueSnapshot: 1000,
        },
        {
          merchantId: 'm1',
          merchant: { name: 'Cafe' },
          redeemedAt: new Date('2026-05-31T20:00:00.000Z'),
          faceValueSnapshot: 500,
        },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getRedemptions({ ...range });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        merchantId: 'm1',
        merchantName: 'Cafe',
        day: '2026-06-01',
        count: 2,
        faceValueTotal: 1500,
      });
    });
  });
});
