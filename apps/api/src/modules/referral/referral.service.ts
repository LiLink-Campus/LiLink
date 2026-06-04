import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  generateHumanCode,
  PERSONAL_CODE_LENGTH,
  REFERRAL_CHANNELS,
  readReferralChannel,
  type ReferralChannel,
} from '@lilink/shared';
import { env } from '../../config/env';
import { PrismaClient } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma/errors';

// Accepts either the base client or a transaction client, so attribution can be
// resolved and frozen inside the registration transaction.
type ReferralReadClient = Pick<PrismaClient, 'user' | 'campaign'>;

const PERSONAL_CODE_MAX_ATTEMPTS = 8;

export interface RegistrationSourceInput {
  // Personal referral code from the invite link / cookie (10-char system).
  referralCode?: string | null;
  channel?: string | null;
  campaignSlug?: string | null;
}

export interface RegistrationAttribution {
  referredByUserId: string | null;
  referralChannel: ReferralChannel | null;
  // Frozen at registration; never re-derived afterwards.
  referralCampaignId: string | null;
}

export interface MyReferralOverview {
  referralCode: string | null;
  links: { channel: ReferralChannel; url: string }[];
  funnel: {
    invited: number;
    registered: number;
    activated: number;
    granted: number;
    redeemed: number;
  };
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure a user has a personal referral code (10 chars). Idempotent: returns
   * the existing code if already set. Called after registration and lazily from
   * the referral page. Unique-column collisions are retried; any failure is
   * logged and swallowed (a referral code is a marketing field, not a gate, so
   * it must never block the caller — the page can re-trigger assignment later).
   */
  async assignReferralCodeIfMissing(userId: string): Promise<string | null> {
    // Whole method is guarded: a referral code is a marketing field, never a
    // gate, so this must never throw into the caller (registration). The
    // referral page can re-trigger assignment later.
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (!user) return null;
      if (user.referralCode) return user.referralCode;

      for (
        let attempt = 0;
        attempt < PERSONAL_CODE_MAX_ATTEMPTS;
        attempt += 1
      ) {
        const code = generateHumanCode({ length: PERSONAL_CODE_LENGTH });
        try {
          // Compare-and-set on the null guard: concurrent callers cannot
          // overwrite a code another call already assigned.
          const updated = await this.prisma.user.updateMany({
            where: { id: userId, referralCode: null },
            data: { referralCode: code },
          });
          if (updated.count === 1) return code;
          // count 0: a concurrent call already set it -> return that value.
          const current = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { referralCode: true },
          });
          return current?.referralCode ?? null;
        } catch (error) {
          if (isUniqueConstraintError(error)) continue; // code taken -> retry
          throw error;
        }
      }
      this.logger.warn(`Exhausted referral code attempts for ${userId}.`);
      return null;
    } catch (error) {
      this.logger.warn(
        `assignReferralCodeIfMissing failed for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Resolve the attribution to freeze on a new user at registration.
   *
   * The campaign is frozen here and MUST NOT be re-derived later (activation
   * reads only the frozen value):
   *   personal link campaign (only when ACTIVE)
   *   > current ACTIVE default campaign
   *   > none
   */
  async resolveRegistrationAttribution(
    input: RegistrationSourceInput,
    client: ReferralReadClient = this.prisma,
  ): Promise<RegistrationAttribution> {
    let referredByUserId: string | null = null;
    let referralChannel: ReferralChannel | null = null;
    let referralCampaignId: string | null = null;

    if (input.referralCode) {
      const code = input.referralCode.trim().toUpperCase();
      if (code) {
        const referrer = await client.user.findUnique({
          where: { referralCode: code },
          select: { id: true },
        });
        if (referrer) {
          referredByUserId = referrer.id;
          referralChannel = readReferralChannel(input.channel);
          if (input.campaignSlug) {
            const campaign = await client.campaign.findUnique({
              where: { slug: input.campaignSlug },
              select: { id: true, status: true },
            });
            if (campaign && campaign.status === 'ACTIVE') {
              referralCampaignId = campaign.id;
            }
          }
        }
        // Invalid personal code -> ignore source, registration still proceeds.
      }
    }

    // No source campaign resolved -> freeze the current ACTIVE default (if any).
    if (!referralCampaignId) {
      const fallback = await client.campaign.findFirst({
        where: { isDefault: true, status: 'ACTIVE' },
        select: { id: true },
      });
      referralCampaignId = fallback?.id ?? null;
    }

    return { referredByUserId, referralChannel, referralCampaignId };
  }

  /** Record a share-button click (intent). Not deduped — every tap counts. */
  async recordShareEvent(
    referrerUserId: string,
    channel: ReferralChannel,
    campaignSlug?: string | null,
  ): Promise<void> {
    // Skip share events from test accounts so they never enter the funnel
    // (ReferralEvent has no user FK, so test is filtered at write time).
    const referrer = await this.prisma.user.findUnique({
      where: { id: referrerUserId },
      select: { isTest: true },
    });
    if (referrer?.isTest) return;

    await this.prisma.referralEvent.create({
      data: {
        type: 'SHARE',
        referrerUserId,
        campaignId: await this.resolveEventCampaignId(campaignSlug),
        channel,
      },
    });
  }

  /**
   * Record a landing-page click. Only the personal referral code length is
   * accepted; other lengths or unknown codes are INVALID. The campaign is the
   * *current* campaign of this link (`?c=` when ACTIVE, else the active
   * default) — NOT the referrer's own source campaign, so the funnel attributes
   * the click to the running campaign. CLICK is UV-deduped per (code, day,
   * visitor): a dedupeKey collision is a same-visitor repeat and is ignored.
   */
  async recordClickEvent(input: {
    code: string;
    channel?: string | null;
    campaignSlug?: string | null;
    visitorHash: string;
  }): Promise<{ result: 'OK' | 'INVALID' }> {
    const code = input.code.trim().toUpperCase();
    let referrerUserId: string | null = null;

    if (code.length === PERSONAL_CODE_LENGTH) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!referrer) return { result: 'INVALID' };
      referrerUserId = referrer.id;
    } else {
      return { result: 'INVALID' };
    }

    const campaignId = await this.resolveEventCampaignId(input.campaignSlug);
    const day = new Date().toISOString().slice(0, 10);
    const dedupeKey = createHash('sha256')
      .update(`${code}\n${day}\n${input.visitorHash}`)
      .digest('hex');
    try {
      await this.prisma.referralEvent.create({
        data: {
          type: 'CLICK',
          referrerUserId,
          campaignId,
          channel: readReferralChannel(input.channel),
          dedupeKey,
          visitorHash: input.visitorHash,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      // Already recorded for this visitor today -> dedupe, no-op.
    }
    return { result: 'OK' };
  }

  /**
   * The campaign a share/click belongs to: the link's `?c=` campaign when it is
   * ACTIVE, otherwise the current ACTIVE default. This is the running campaign
   * the funnel attributes the event to — independent of the referrer's own
   * frozen source campaign.
   */
  private async resolveEventCampaignId(
    campaignSlug?: string | null,
  ): Promise<string | null> {
    if (campaignSlug) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { slug: campaignSlug },
        select: { id: true, status: true },
      });
      if (campaign && campaign.status === 'ACTIVE') return campaign.id;
    }
    const fallback = await this.prisma.campaign.findFirst({
      where: { isDefault: true, status: 'ACTIVE' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  /**
   * Build the signed-in user's referral overview: personal code, per-channel
   * share links, and the funnel of people they referred (personal code). The
   * activated/claimed/redeemed counts read M0 tables and stay 0 until M2/M3
   * produce activation/coupon/redemption data. Test accounts are excluded.
   */
  async getMyReferralOverview(userId: string): Promise<MyReferralOverview> {
    const referralCode = await this.assignReferralCodeIfMissing(userId);
    const origin = env.CLIENT_ORIGIN[0]?.replace(/\/+$/, '') ?? '';
    const links = referralCode
      ? REFERRAL_CHANNELS.map((channel) => ({
          channel,
          url: `${origin}/i/${referralCode}?ch=${channel}`,
        }))
      : [];

    const referrals = await this.prisma.user.findMany({
      where: { referredByUserId: userId, isTest: false },
      select: { id: true },
    });
    const referredIds = referrals.map((referral) => referral.id);
    const invited = referredIds.length;

    let activated = 0;
    let granted = 0;
    let redeemed = 0;
    if (referredIds.length > 0) {
      const [activatedUsers, grantedUsers, redeemedUsers] = await Promise.all([
        this.prisma.campaignActivation.findMany({
          where: { userId: { in: referredIds } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.campaignActivation.findMany({
          where: {
            userId: { in: referredIds },
            couponsGrantedAt: { not: null },
          },
          select: { userId: true },
          distinct: ['userId'],
        }),
        this.prisma.redemption.findMany({
          where: { userId: { in: referredIds } },
          select: { userId: true },
          distinct: ['userId'],
        }),
      ]);
      activated = activatedUsers.length;
      granted = grantedUsers.length;
      redeemed = redeemedUsers.length;
    }

    return {
      referralCode,
      links,
      funnel: { invited, registered: invited, activated, granted, redeemed },
    };
  }
}
