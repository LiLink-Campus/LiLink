import { HARD_MATCH_KEYS } from '@lilink/shared';
import {
  ChannelBreakdownRow,
  PromotionDashboardService,
} from './promotion-dashboard.service';

function makePrisma() {
  return {
    referralEvent: { count: jest.fn(), findMany: jest.fn() },
    user: { findMany: jest.fn() },
    campaignActivation: { count: jest.fn() },
    coupon: { count: jest.fn(), groupBy: jest.fn() },
    redemption: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
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
      // getFunnel now uses findMany({ select: { channel } }) for SHARE + CLICK
      // so that the same arrays feed both total counts and channelBreakdown.
      prisma.referralEvent.findMany
        .mockResolvedValueOnce(Array(100).fill({ channel: 'WECHAT_MOMENTS' })) // 100 SHARE
        .mockResolvedValueOnce(Array(60).fill({ channel: 'COPY_LINK' })); // 60 CLICK
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

      // Canonical UPPERCASE source value (post-normalization by DTO Transform).
      const result = await service.getLeaderboard({
        ...range,
        source: 'PERSONAL',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toEqual({
        sourceType: 'PERSONAL',
        refLabel: '小红',
        invited: 2,
        registered: 2,
        activated: 1,
        granted: 1,
        redeemed: 1,
        byGender: { male: 1, female: 1, nonBinary: 0, unknown: 0 },
      });
    });

    it('returns a DEFAULT bucket for users with no referredByUserId and no inviteCodeId', async () => {
      const prisma = makePrisma();
      prisma.user.findMany.mockResolvedValue([
        {
          referredByUserId: null,
          referredBy: null,
          inviteCodeId: null,
          inviteCode: null,
          questionnaireResponse: null,
          campaignActivations: [],
          coupons: [],
        },
        {
          referredByUserId: null,
          referredBy: null,
          inviteCodeId: null,
          inviteCode: null,
          questionnaireResponse: {
            submittedAt: submitted,
            answers: { [HARD_MATCH_KEYS.gender]: '女' },
          },
          campaignActivations: [{ id: 'a2' }],
          coupons: [],
        },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getLeaderboard({
        ...range,
        source: 'DEFAULT',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        sourceType: 'DEFAULT',
        refLabel: 'DEFAULT',
        invited: 2,
        registered: 2,
        activated: 1,
        byGender: expect.objectContaining({ female: 1, unknown: 1 }) as object,
      });
    });

    it('uses deriveReferralSource: RECRUITER beats PERSONAL when both fields are set', async () => {
      const prisma = makePrisma();
      // A user with both fields set is classified as RECRUITER (priority rule).
      prisma.user.findMany.mockResolvedValue([
        {
          referredByUserId: 'u1',
          referredBy: { referralCode: 'C1', displayName: 'Alice' },
          inviteCodeId: 'inv1',
          inviteCode: { ownerName: 'RecruiterCo' },
          questionnaireResponse: null,
          campaignActivations: [],
          coupons: [],
        },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getLeaderboard({
        ...range,
        source: 'RECRUITER',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        sourceType: 'RECRUITER',
        refLabel: 'RecruiterCo',
      });
    });
  });

  describe('getFunnel channelBreakdown', () => {
    it('splits events into medium/scene buckets using splitReferralChannel', async () => {
      const prisma = makePrisma();
      // Two WECHAT_MOMENTS shares, one WECHAT_GROUP share, one COPY_LINK click.
      prisma.referralEvent.findMany
        .mockResolvedValueOnce([
          { channel: 'WECHAT_MOMENTS' },
          { channel: 'WECHAT_MOMENTS' },
          { channel: 'WECHAT_GROUP' },
        ])
        .mockResolvedValueOnce([{ channel: 'COPY_LINK' }]);
      prisma.user.findMany.mockResolvedValue([]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getFunnel({ ...range });
      const breakdown: ChannelBreakdownRow[] = result.channelBreakdown;

      // Sorted: highest total (share+click) first; ties broken by medium alpha.
      // WECHAT/MOMENTS (total=2) > LINK/null (total=1) = WECHAT/GROUP (total=1)
      // Tie-break: LINK < WECHAT alphabetically → LINK comes before WECHAT/GROUP.
      expect(breakdown[0]).toEqual({
        medium: 'WECHAT',
        scene: 'MOMENTS',
        share: 2,
        click: 0,
      });
      expect(breakdown[1]).toEqual({
        medium: 'LINK',
        scene: null,
        share: 0,
        click: 1,
      });
      expect(breakdown[2]).toEqual({
        medium: 'WECHAT',
        scene: 'GROUP',
        share: 1,
        click: 0,
      });
    });

    it('returns empty channelBreakdown when there are no events with a channel', async () => {
      const prisma = makePrisma();
      // Events with null channels are skipped.
      prisma.referralEvent.findMany
        .mockResolvedValueOnce([{ channel: null }])
        .mockResolvedValueOnce([{ channel: null }]);
      prisma.user.findMany.mockResolvedValue([]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getFunnel({ ...range });
      expect(result.channelBreakdown).toEqual([]);
    });

    it('merges share and click into the same bucket for the same channel', async () => {
      const prisma = makePrisma();
      prisma.referralEvent.findMany
        .mockResolvedValueOnce([{ channel: 'QR' }, { channel: 'QR' }])
        .mockResolvedValueOnce([{ channel: 'QR' }]);
      prisma.user.findMany.mockResolvedValue([]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getFunnel({ ...range });
      expect(result.channelBreakdown).toEqual([
        { medium: 'QR', scene: null, share: 2, click: 1 },
      ]);
    });
  });

  describe('getCoupons', () => {
    it('aggregates granted by template to merchant and redeemed by merchant, sorted by granted desc', async () => {
      const prisma = makePrisma();
      // m1 has two templates (t1,t2); m2 has one (t3).
      prisma.couponTemplate.findMany.mockResolvedValue([
        { id: 't1', merchantId: 'm1', merchant: { name: 'Cafe' } },
        { id: 't2', merchantId: 'm1', merchant: { name: 'Cafe' } },
        { id: 't3', merchantId: 'm2', merchant: { name: 'Bar' } },
      ]);
      // granted groups: t1:6, t2:4 (m1=10), t3:3 (m2=3)
      prisma.coupon.groupBy.mockResolvedValue([
        { templateId: 't1', _count: { _all: 6 } },
        { templateId: 't2', _count: { _all: 4 } },
        { templateId: 't3', _count: { _all: 3 } },
      ]);
      // redeemed groups: m1:2 (m2 absent means 0)
      prisma.redemption.groupBy.mockResolvedValue([
        { merchantId: 'm1', _count: { _all: 2 } },
      ]);
      const service = new PromotionDashboardService(prisma as never);

      const result = await service.getCoupons({ ...range });

      // granted-desc order: m1(10) before m2(3)
      expect(result.items).toEqual([
        { merchantId: 'm1', merchantName: 'Cafe', granted: 10, redeemed: 2 },
        { merchantId: 'm2', merchantName: 'Bar', granted: 3, redeemed: 0 },
      ]);
      // contract: coupon.groupBy by templateId, isTest excluded, scoped to campaign + range
      expect(prisma.coupon.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['templateId'],
          where: expect.objectContaining({
            issuedAt: { gte: new Date(range.from), lt: new Date(range.to) },
            user: { is: { isTest: false } },
            template: { is: { campaignId: 'c1' } },
          }) as object,
        }),
      );
      // redemption.groupBy by merchantId, scoped to campaign + range + non-test
      expect(prisma.redemption.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['merchantId'],
          where: expect.objectContaining({
            merchantId: { in: ['m1', 'm2'] },
            redeemedAt: { gte: new Date(range.from), lt: new Date(range.to) },
          }) as object,
        }),
      );
      // no per-merchant count fan-out anymore
      expect(prisma.coupon.count).not.toHaveBeenCalled();
      expect(prisma.redemption.count).not.toHaveBeenCalled();
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
