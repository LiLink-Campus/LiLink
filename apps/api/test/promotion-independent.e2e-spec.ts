import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CampaignService } from '../src/modules/campaign/campaign.service';
import { ReferralService } from '../src/modules/referral/referral.service';
import { ActivationService } from '../src/modules/activation/activation.service';
import { CouponService } from '../src/modules/coupon/coupon.service';
import { PromotionDashboardService } from '../src/modules/promotion-dashboard/promotion-dashboard.service';

const tag = `promotion-${randomUUID()}`;
describe('Independent acquisition and global merchant activities (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let campaigns: CampaignService;
  let referral: ReferralService;
  let coupons: CouponService;
  let growth: PromotionDashboardService;
  let admin: string;
  let merchant: string;
  let inviter: string;
  let oldUser: string;
  let newUser: string;
  let draftA: string;
  let draftB: string;
  let active: string;
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date(Date.now() + 86400000).toISOString();

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    const client = prisma as PrismaService;
    campaigns = new CampaignService(client);
    referral = new ReferralService(client);
    coupons = new CouponService(client, new ActivationService(client));
    growth = new PromotionDashboardService(client);
    admin = (
      await prisma.adminOperator.create({
        data: { email: `${tag}@example.test`, passwordHash: 'unused' },
      })
    ).id;
    merchant = (await prisma.merchant.create({ data: { name: tag } })).id;
    inviter = (
      await prisma.user.create({
        data: {
          email: `inviter-${tag}@example.test`,
          passwordHash: 'unused',
          status: 'ACTIVE',
          referralCode: 'TESTREF123',
          createdAt: new Date('2020-01-01'),
        },
      })
    ).id;
    const version = await prisma.questionnaireVersion.create({
      data: { title: tag },
    });
    const legacy = await prisma.campaign.create({
      data: { name: 'Historical', slug: tag, status: 'ENDED' },
    });
    for (const kind of ['old', 'new', 'test', 'deleted']) {
      const user = await prisma.user.create({
        data: {
          email: `${kind}-${tag}@example.test`,
          passwordHash: 'unused',
          status: 'ACTIVE',
          firstOptedInAt: new Date(),
          referredByUserId: inviter,
          referralChannel: 'WECHAT_GROUP',
          referralCampaignId: kind === 'old' ? legacy.id : null,
          isTest: kind === 'test',
          deactivatedAt: kind === 'deleted' ? new Date() : null,
          questionnaireResponse: {
            create: {
              versionId: version.id,
              answers: {},
              submittedAt: new Date(),
            },
          },
        },
      });
      if (kind === 'old') oldUser = user.id;
      if (kind === 'new') newUser = user.id;
    }
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('tracks invitation source and events without any running merchant activity', async () => {
    expect(
      await referral.resolveRegistrationAttribution({
        referralCode: 'TESTREF123',
        channel: 'WECHAT_GROUP',
        campaignSlug: tag,
      }),
    ).toEqual({
      referredByUserId: inviter,
      referralChannel: 'WECHAT_GROUP',
      referralCampaignId: null,
    });
    await referral.recordShareEvent(inviter, 'WECHAT_GROUP');
    await referral.recordClickEvent({
      code: 'TESTREF123',
      channel: 'WECHAT_GROUP',
      visitorHash: tag,
      campaignSlug: tag,
    });
    await referral.recordClickEvent({
      code: 'TESTREF123',
      channel: 'WECHAT_GROUP',
      visitorHash: tag,
    });
    expect(
      await prisma.referralEvent.count({
        where: { campaignId: { not: null } },
      }),
    ).toBe(0);
    const result = await growth.getAcquisition({ from, to });
    expect(result).toMatchObject({
      shares: 1,
      visits: 1,
      registrations: 2,
      invitedRegistrations: 2,
      qualified: 2,
    });
    expect(result.referrers[0]).toMatchObject({
      id: inviter,
      registrations: 2,
      qualified: 2,
    });
    expect(
      (await referral.getMyReferralOverview(inviter)).funnel.activated,
    ).toBe(2);
    expect((await coupons.getMyCoupons(oldUser)).items).toHaveLength(0);
  });

  it('requires valid coupons and permits only one concurrent publication', async () => {
    draftA = (await campaigns.createCampaign({ name: 'Activity A' }, admin)).id;
    draftB = (await campaigns.createCampaign({ name: 'Activity B' }, admin)).id;
    await expect(
      campaigns.updateCampaign(draftA, { status: 'ACTIVE' }, admin),
    ).rejects.toThrow('优惠券');
    for (const id of [draftA, draftB])
      await campaigns.createTemplate(
        id,
        {
          merchantId: merchant,
          title: 'Coffee',
          benefitType: 'CUSTOM',
          faceValue: 1000,
          validDays: 30,
        },
        admin,
      );
    const results = await Promise.allSettled(
      [draftA, draftB].map((id) =>
        campaigns.updateCampaign(id, { status: 'ACTIVE' }, admin),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.campaign.count({ where: { status: 'ACTIVE' } })).toBe(
      1,
    );
    active = (
      await prisma.campaign.findFirstOrThrow({ where: { status: 'ACTIVE' } })
    ).id;
  });

  it('old and new users receive current coupons once, including concurrent visits', async () => {
    await Promise.all([
      coupons.getMyCoupons(oldUser),
      coupons.getMyCoupons(oldUser),
      coupons.getMyCoupons(newUser),
    ]);
    for (const id of [oldUser, newUser]) {
      const result = await coupons.getMyCoupons(id);
      expect(result.items).toHaveLength(1);
      expect(
        await prisma.coupon.count({
          where: { userId: id, template: { campaignId: active } },
        }),
      ).toBe(1);
    }
    expect(await campaigns.getResults(active)).toMatchObject({
      recipients: 2,
      issued: 2,
      redeemed: 0,
    });
    const template = await prisma.couponTemplate.findFirstOrThrow({
      where: { campaignId: active },
    });
    await expect(
      campaigns.updateTemplate(template.id, { isActive: false }, admin),
    ).rejects.toThrow('草稿');
  });

  it('new activity grants again without rewriting acquisition or historical coupons', async () => {
    await campaigns.updateCampaign(active, { status: 'ENDED' }, admin);
    const next = active === draftA ? draftB : draftA;
    await campaigns.updateCampaign(next, { status: 'ACTIVE' }, admin);
    expect((await coupons.getMyCoupons(oldUser)).items).toHaveLength(2);
    expect((await coupons.getMyCoupons(newUser)).items).toHaveLength(2);
    expect((await growth.getAcquisition({ from, to })).registrations).toBe(2);
    expect(await campaigns.getResults(next)).toMatchObject({
      recipients: 2,
      issued: 2,
    });
    await expect(
      campaigns.updateCampaign(active, { status: 'ACTIVE' }, admin),
    ).rejects.toThrow('不能重新发布');
    await campaigns.updateCampaign(next, { status: 'ENDED' }, admin);
    expect((await coupons.getMyCoupons(oldUser)).items).toHaveLength(2);
  });
  it('preserves issued activity records after account deactivation', async () => {
    await prisma.user.update({
      where: { id: oldUser },
      data: { deactivatedAt: new Date() },
    });
    expect(await campaigns.getResults(active)).toMatchObject({
      recipients: 2,
      issued: 2,
    });
    expect((await growth.getAcquisition({ from, to })).registrations).toBe(1);
  });

  it('pauses ambiguous legacy activities and resumes only after an operator keeps one', async () => {
    const historicalCoupons = await prisma.coupon.findMany({
      where: { userId: newUser },
      orderBy: { id: 'asc' },
    });
    const legacyIds: string[] = [];
    try {
      for (const name of ['Legacy A', 'Legacy B']) {
        const campaign = await campaigns.createCampaign({ name }, admin);
        legacyIds.push(campaign.id);
        await campaigns.createTemplate(
          campaign.id,
          {
            merchantId: merchant,
            title: `${name} reward`,
            benefitType: 'CUSTOM',
            faceValue: 1000,
            validDays: 30,
          },
          admin,
        );
      }
      // This was a valid state before the single-global-activity policy.
      await prisma.campaign.updateMany({
        where: { id: { in: legacyIds } },
        data: { status: 'ACTIVE' },
      });
      await prisma.campaign.update({
        where: { id: legacyIds[1] },
        data: { isDefault: true },
      });
      expect(
        await campaigns.listCampaigns({ status: 'ACTIVE', pageSize: 1 }),
      ).toMatchObject({ total: 2 });

      await coupons.getMyCoupons(newUser);
      expect(
        await prisma.campaignActivation.count({
          where: { userId: newUser, campaignId: { in: legacyIds } },
        }),
      ).toBe(0);
      expect(
        await prisma.coupon.findMany({
          where: { userId: newUser },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(historicalCoupons);

      await campaigns.updateCampaign(legacyIds[0], { status: 'ENDED' }, admin);
      const remaining = await campaigns.listCampaigns({
        status: 'ACTIVE',
        pageSize: 1,
      });
      expect(remaining.total).toBe(1);
      expect(remaining.items[0].id).toBe(legacyIds[1]);
      await Promise.all([
        coupons.getMyCoupons(newUser),
        coupons.getMyCoupons(newUser),
      ]);
      expect(
        await prisma.coupon.count({
          where: { userId: newUser, template: { campaignId: legacyIds[1] } },
        }),
      ).toBe(1);
      expect(
        await prisma.coupon.count({
          where: { userId: newUser, template: { campaignId: legacyIds[0] } },
        }),
      ).toBe(0);
      expect(
        await prisma.coupon.findMany({
          where: { id: { in: historicalCoupons.map((coupon) => coupon.id) } },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(historicalCoupons);
    } finally {
      await prisma.campaign.updateMany({
        where: { id: { in: legacyIds } },
        data: { status: 'ENDED', isDefault: false },
      });
    }
  });
});
