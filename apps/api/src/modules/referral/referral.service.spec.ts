import {
  HUMAN_CODE_ALPHABET,
  PERSONAL_CODE_LENGTH,
  REFERRAL_CHANNELS,
} from '@lilink/shared';
import { ReferralService } from './referral.service';

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    campaign: { findUnique: jest.fn(), findFirst: jest.fn() },
    referralEvent: { create: jest.fn().mockResolvedValue({}) },
    campaignActivation: { findMany: jest.fn().mockResolvedValue([]) },
    redemption: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('ReferralService', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('assignReferralCodeIfMissing', () => {
    it('returns the existing code without writing', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'EXISTING123' });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(code).toBe('EXISTING123');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('assigns a fresh 10-char code via a null-guarded compare-and-set', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(code).toHaveLength(PERSONAL_CODE_LENGTH);
      expect(
        [...(code ?? '')].every((ch) => HUMAN_CODE_ALPHABET.includes(ch)),
      ).toBe(true);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', referralCode: null },
        data: { referralCode: code },
      });
    });

    it('retries on a unique-code collision (P2002)', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      let calls = 0;
      prisma.user.updateMany.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(
            Object.assign(new Error('dup'), { code: 'P2002' }),
          );
        }
        return Promise.resolve({ count: 1 });
      });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(calls).toBe(2);
      expect(code).toHaveLength(PERSONAL_CODE_LENGTH);
    });

    it('returns the concurrently-assigned code when the CAS matches 0 rows', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique
        .mockResolvedValueOnce({ referralCode: null }) // initial read
        .mockResolvedValueOnce({ referralCode: 'CONCURRENT9' }); // re-read after CAS
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(code).toBe('CONCURRENT9');
    });

    it('returns null when the user does not exist', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      expect(await service.assignReferralCodeIfMissing('missing')).toBeNull();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('swallows DB errors and never throws into the caller', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockRejectedValue(new Error('connection lost'));
      const service = new ReferralService(prisma as never);

      await expect(
        service.assignReferralCodeIfMissing('user-1'),
      ).resolves.toBeNull();
    });
  });

  describe('resolveRegistrationAttribution', () => {
    it('resolves referrer + channel + ACTIVE link campaign for a personal code', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'ref-1' });
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-y',
        status: 'ACTIVE',
      });
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({
        referralCode: ' abc2345xyz ',
        channel: 'WECHAT_GROUP',
        campaignSlug: 'spring',
      });

      expect(result).toEqual({
        referredByUserId: 'ref-1',
        referralChannel: 'WECHAT_GROUP',
        referralCampaignId: 'camp-y',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { referralCode: 'ABC2345XYZ' },
        select: { id: true, status: true },
      });
      expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the default campaign when the link campaign is not ACTIVE', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'ref-1' });
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-y',
        status: 'ENDED',
      });
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({
        referralCode: 'ABC2345XYZ',
        channel: 'WECHAT_GROUP',
        campaignSlug: 'ended',
      });

      expect(result).toEqual({
        referredByUserId: 'ref-1',
        referralChannel: 'WECHAT_GROUP',
        referralCampaignId: 'camp-default',
      });
    });

    it('ignores an invalid personal code and falls back to the default campaign', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({
        referralCode: 'NOSUCHCODE',
        channel: 'WECHAT_GROUP',
      });

      expect(result).toEqual({
        referredByUserId: null,
        referralChannel: null,
        referralCampaignId: 'camp-default',
      });
    });

    it('uses the ACTIVE default campaign when there is no source', async () => {
      const prisma = makePrisma();
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({});

      expect(result).toEqual({
        referredByUserId: null,
        referralChannel: null,
        referralCampaignId: 'camp-default',
      });
      expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { isDefault: true, status: 'ACTIVE' },
        select: { id: true },
      });
    });

    it('returns a null campaign when there is no source and no default', async () => {
      const prisma = makePrisma();
      prisma.campaign.findFirst.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({});

      expect(result.referralCampaignId).toBeNull();
    });

    it('throws when requireReferralCode is set but no code is provided', async () => {
      const prisma = makePrisma();
      const service = new ReferralService(prisma as never);

      await expect(
        service.resolveRegistrationAttribution({}, prisma as never, {
          requireReferralCode: true,
        }),
      ).rejects.toThrow('Referral code is required');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws when requireReferralCode is set and the code is unknown', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      await expect(
        service.resolveRegistrationAttribution(
          { referralCode: 'NOSUCHCODE' },
          prisma as never,
          { requireReferralCode: true },
        ),
      ).rejects.toThrow('Referral code is invalid');
    });

    it('rejects a non-ACTIVE referrer for non-school (requireReferralCode) registration', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'SUSPENDED',
      });
      const service = new ReferralService(prisma as never);

      await expect(
        service.resolveRegistrationAttribution(
          { referralCode: 'ABC2345XYZ' },
          prisma as never,
          { requireReferralCode: true },
        ),
      ).rejects.toThrow('Referral code is invalid');
    });

    it('accepts an ACTIVE referrer for non-school (requireReferralCode) registration', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'ACTIVE',
      });
      prisma.campaign.findFirst.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution(
        { referralCode: 'ABC2345XYZ', channel: 'WECHAT_GROUP' },
        prisma as never,
        { requireReferralCode: true },
      );

      expect(result.referredByUserId).toBe('ref-1');
      expect(result.referralChannel).toBe('WECHAT_GROUP');
    });

    it('silently ignores an unknown code on school (optional-code) registration', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.campaign.findFirst.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      // School registration is tolerant: an invalid optional code is ignored and
      // registration proceeds without recording an attribution (no throw).
      const result = await service.resolveRegistrationAttribution(
        { referralCode: 'NOSUCHCODE' },
        prisma as never,
      );

      expect(result.referredByUserId).toBeNull();
      expect(result.referralChannel).toBeNull();
    });

    it('still records attribution for a non-ACTIVE referrer on school (optional-code) registration', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'SUSPENDED',
      });
      prisma.campaign.findFirst.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution(
        { referralCode: 'ABC2345XYZ' },
        prisma as never,
      );

      // School registration does not gate on referrer status, so attribution is
      // preserved even when the referrer is suspended (no quota is consumed).
      expect(result.referredByUserId).toBe('ref-1');
    });
  });

  describe('recordShareEvent', () => {
    it('attributes the SHARE to the active default campaign, not the referrer source', async () => {
      const prisma = makePrisma();
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      const service = new ReferralService(prisma as never);

      prisma.user.findUnique.mockResolvedValue({ isTest: false });

      await service.recordShareEvent('user-1', 'WECHAT_MOMENTS');

      // campaignId comes from the active default (resolveEventCampaignId), not
      // the referrer's own frozen source campaign.
      expect(prisma.referralEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'SHARE',
          referrerUserId: 'user-1',
          campaignId: 'camp-default',
          channel: 'WECHAT_MOMENTS',
        },
      });
    });

    it('skips the SHARE event for a test referrer', async () => {
      const prisma = makePrisma();
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      prisma.user.findUnique.mockResolvedValue({ isTest: true });
      const service = new ReferralService(prisma as never);

      await service.recordShareEvent('user-1', 'WECHAT_MOMENTS');

      expect(prisma.referralEvent.create).not.toHaveBeenCalled();
    });

    it('uses the ?c= campaign when it is ACTIVE', async () => {
      const prisma = makePrisma();
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-spring',
        status: 'ACTIVE',
      });
      const service = new ReferralService(prisma as never);

      await service.recordShareEvent('user-1', 'WECHAT_GROUP', 'spring');

      expect(prisma.referralEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            campaignId: 'camp-spring',
          }) as object,
        }) as object,
      );
      expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('recordClickEvent', () => {
    it('records a CLICK for a 10-char personal code, attributed to the current campaign', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'ACTIVE',
        nonEduReferralLimit: 3,
        nonEduReferralUses: 1,
      });
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'ABC2345XYZ',
        channel: 'WECHAT_GROUP',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'OK' });
      expect(prisma.referralEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'CLICK',
            referrerUserId: 'ref-1',
            campaignId: 'camp-default',
            channel: 'WECHAT_GROUP',
            visitorHash: 'vh',
          }) as object,
        }) as object,
      );
    });

    it('returns INVALID for an unexpected code length without writing', async () => {
      const prisma = makePrisma();
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'SHORT',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'INVALID' });
      expect(prisma.referralEvent.create).not.toHaveBeenCalled();
    });

    it('returns INVALID for an unknown personal code', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'ABC2345XYZ',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'INVALID' });
      expect(prisma.referralEvent.create).not.toHaveBeenCalled();
    });

    it('returns INVALID for a suspended referrer without writing', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'SUSPENDED',
        nonEduReferralLimit: 3,
        nonEduReferralUses: 1,
      });
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'ABC2345XYZ',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'INVALID' });
      expect(prisma.referralEvent.create).not.toHaveBeenCalled();
    });

    it('returns INVALID for an exhausted non-school referral quota without writing', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'ACTIVE',
        nonEduReferralLimit: 3,
        nonEduReferralUses: 3,
      });
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'ABC2345XYZ',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'INVALID' });
      expect(prisma.referralEvent.create).not.toHaveBeenCalled();
    });

    it('treats a dedupeKey collision as an already-counted visit (still OK)', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        id: 'ref-1',
        status: 'ACTIVE',
        nonEduReferralLimit: 3,
        nonEduReferralUses: 1,
      });
      prisma.campaign.findFirst.mockResolvedValue({ id: 'camp-default' });
      prisma.referralEvent.create.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      const service = new ReferralService(prisma as never);

      const result = await service.recordClickEvent({
        code: 'ABC2345XYZ',
        visitorHash: 'vh',
      });

      expect(result).toEqual({ result: 'OK' });
    });
  });

  describe('getMyReferralOverview', () => {
    it('returns code, per-channel links, and funnel counts', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'PERSONAL10' }); // assign: existing
      prisma.user.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      prisma.campaignActivation.findMany.mockResolvedValue([{ userId: 'r1' }]);
      prisma.redemption.findMany.mockResolvedValue([]);
      const service = new ReferralService(prisma as never);

      const result = await service.getMyReferralOverview('user-1');

      expect(result.referralCode).toBe('PERSONAL10');
      expect(result.links).toHaveLength(REFERRAL_CHANNELS.length);
      expect(result.funnel).toEqual({
        invited: 2,
        registered: 2,
        activated: 1,
        granted: 1,
        redeemed: 0,
      });
    });

    it('returns zeroed funnel when the user has no referrals', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'PERSONAL10' });
      prisma.user.findMany.mockResolvedValue([]);
      const service = new ReferralService(prisma as never);

      const result = await service.getMyReferralOverview('user-1');

      expect(result.funnel).toEqual({
        invited: 0,
        registered: 0,
        activated: 0,
        granted: 0,
        redeemed: 0,
      });
      expect(prisma.campaignActivation.findMany).not.toHaveBeenCalled();
    });

    it('reports the non-edu referral quota for the owner', async () => {
      const prisma = makePrisma();
      // One row backs both findUnique calls (assign reads referralCode, the owner
      // read selects the quota columns).
      prisma.user.findUnique.mockResolvedValue({
        referralCode: 'PERSONAL10',
        nonEduReferralLimit: 5,
        nonEduReferralUses: 2,
      });
      prisma.user.findMany.mockResolvedValue([]);
      const service = new ReferralService(prisma as never);

      const result = await service.getMyReferralOverview('user-1');

      expect(result.nonEduReferralQuota).toEqual({
        limit: 5,
        uses: 2,
        remaining: 3,
      });
    });

    it('clamps the remaining quota to zero when uses exceed the limit', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({
        referralCode: 'PERSONAL10',
        nonEduReferralLimit: 1,
        nonEduReferralUses: 4,
      });
      prisma.user.findMany.mockResolvedValue([]);
      const service = new ReferralService(prisma as never);

      const result = await service.getMyReferralOverview('user-1');

      expect(result.nonEduReferralQuota).toEqual({
        limit: 1,
        uses: 4,
        remaining: 0,
      });
    });
  });
});
