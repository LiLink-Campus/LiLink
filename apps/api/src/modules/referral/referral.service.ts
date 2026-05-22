import { Injectable, Logger } from '@nestjs/common';
import {
  generateHumanCode,
  PERSONAL_CODE_LENGTH,
  readReferralChannel,
  type ReferralChannel,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

const PERSONAL_CODE_MAX_ATTEMPTS = 8;

export interface RegistrationSourceInput {
  // Recruiter code already resolved to its id by AuthService (8-char system).
  inviteCodeId?: string | null;
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

      for (let attempt = 0; attempt < PERSONAL_CODE_MAX_ATTEMPTS; attempt += 1) {
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
          if (this.isUniqueConstraintError(error)) continue; // code taken -> retry
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
   * A recruiter code (already resolved to `inviteCodeId` by AuthService) takes
   * priority and discards any personal code. The campaign is frozen here and
   * MUST NOT be re-derived later (activation reads only the frozen value):
   *   recruiter inviteCode.campaignId (snapshot)
   *   > personal link campaign (only when ACTIVE)
   *   > current ACTIVE default campaign
   *   > none
   */
  async resolveRegistrationAttribution(
    input: RegistrationSourceInput,
  ): Promise<RegistrationAttribution> {
    let referredByUserId: string | null = null;
    let referralChannel: ReferralChannel | null = null;
    let referralCampaignId: string | null = null;

    if (input.inviteCodeId) {
      // Recruiter path: snapshot the invite code's campaign; ignore personal code.
      const inviteCode = await this.prisma.inviteCode.findUnique({
        where: { id: input.inviteCodeId },
        select: { campaignId: true },
      });
      referralCampaignId = inviteCode?.campaignId ?? null;
    } else if (input.referralCode) {
      const code = input.referralCode.trim().toUpperCase();
      if (code) {
        const referrer = await this.prisma.user.findUnique({
          where: { referralCode: code },
          select: { id: true },
        });
        if (referrer) {
          referredByUserId = referrer.id;
          referralChannel = readReferralChannel(input.channel);
          if (input.campaignSlug) {
            const campaign = await this.prisma.campaign.findUnique({
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
      const fallback = await this.prisma.campaign.findFirst({
        where: { isDefault: true, status: 'ACTIVE' },
        select: { id: true },
      });
      referralCampaignId = fallback?.id ?? null;
    }

    return { referredByUserId, referralChannel, referralCampaignId };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
