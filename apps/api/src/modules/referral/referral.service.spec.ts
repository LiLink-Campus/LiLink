import { HUMAN_CODE_ALPHABET, PERSONAL_CODE_LENGTH } from '@lilink/shared';
import { ReferralService } from './referral.service';

function makePrisma() {
  return {
    user: { findUnique: jest.fn(), update: jest.fn() },
    inviteCode: { findUnique: jest.fn() },
    campaign: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
}

describe('ReferralService', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('assignReferralCodeIfMissing', () => {
    it('returns the existing code without updating', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'EXISTING123' });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(code).toBe('EXISTING123');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('assigns a fresh 10-char code from the alphabet when missing', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      prisma.user.update.mockResolvedValue({});
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(code).toHaveLength(PERSONAL_CODE_LENGTH);
      expect([...(code ?? '')].every((ch) => HUMAN_CODE_ALPHABET.includes(ch))).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { referralCode: code },
      });
    });

    it('retries on a unique-collision (P2002)', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });
      let calls = 0;
      prisma.user.update.mockImplementation(() => {
        calls += 1;
        if (calls === 1) {
          return Promise.reject(Object.assign(new Error('dup'), { code: 'P2002' }));
        }
        return Promise.resolve({});
      });
      const service = new ReferralService(prisma as never);

      const code = await service.assignReferralCodeIfMissing('user-1');

      expect(calls).toBe(2);
      expect(code).toHaveLength(PERSONAL_CODE_LENGTH);
    });

    it('returns null when the user does not exist', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue(null);
      const service = new ReferralService(prisma as never);

      expect(await service.assignReferralCodeIfMissing('missing')).toBeNull();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resolveRegistrationAttribution', () => {
    it('snapshots the recruiter invite code campaign and ignores any personal code', async () => {
      const prisma = makePrisma();
      prisma.inviteCode.findUnique.mockResolvedValue({ campaignId: 'camp-recruiter' });
      const service = new ReferralService(prisma as never);

      const result = await service.resolveRegistrationAttribution({
        inviteCodeId: 'ic-1',
        referralCode: 'SHOULDIGNORE',
        channel: 'WECHAT_MOMENTS',
        campaignSlug: 'spring',
      });

      expect(result).toEqual({
        referredByUserId: null,
        referralChannel: null,
        referralCampaignId: 'camp-recruiter',
      });
      // Personal code / campaign lookups must not run on the recruiter path.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
    });

    it('resolves referrer + channel + ACTIVE link campaign for a personal code', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'ref-1' });
      prisma.campaign.findUnique.mockResolvedValue({ id: 'camp-y', status: 'ACTIVE' });
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
        select: { id: true },
      });
      expect(prisma.campaign.findFirst).not.toHaveBeenCalled();
    });

    it('falls back to the default campaign when the link campaign is not ACTIVE', async () => {
      const prisma = makePrisma();
      prisma.user.findUnique.mockResolvedValue({ id: 'ref-1' });
      prisma.campaign.findUnique.mockResolvedValue({ id: 'camp-y', status: 'ENDED' });
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
  });
});
