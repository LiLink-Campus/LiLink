import { Injectable, Logger } from '@nestjs/common';
import { COUPON_CODE_LENGTH, generateHumanCode } from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const COUPON_CODE_GENERATION_MAX_ATTEMPTS = 10;
const MILLIS_PER_DAY = 86_400_000;

@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently grant activation-reward coupons once a user is activated
   * (QuestionnaireResponse.submittedAt + User.firstOptedInAt). The campaign is
   * resolved only from the frozen attribution (User.referralCampaignId) and
   * coupons are granted only when that campaign is ACTIVE — no fallback to the
   * current default, so attribution never drifts.
   *
   * Never throws into the caller: failures are logged and retried by a later
   * activation trigger or a manual backfill, so the main flow is not blocked.
   */
  async tryGrantCoupons(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          firstOptedInAt: true,
          referralCampaignId: true,
          questionnaireResponse: { select: { submittedAt: true } },
        },
      });
      if (
        !user ||
        !user.firstOptedInAt ||
        !user.questionnaireResponse?.submittedAt ||
        !user.referralCampaignId
      ) {
        return;
      }

      await this.grant(userId, user.referralCampaignId);
    } catch (error) {
      this.logger.warn(
        `tryGrantCoupons failed for ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async grant(userId: string, campaignId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Re-check the campaign is still ACTIVE inside the grant transaction so a
      // status change between the attribution read and the grant cannot leak
      // coupons. Read-committed sees the latest commit; the couponsGrantedAt
      // gate and the (userId, templateId) unique index are further backstops.
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });
      if (!campaign || campaign.status !== 'ACTIVE') return;

      // Stable activation event; couponsGrantedAt is the idempotency gate.
      const activation = await tx.campaignActivation.upsert({
        where: { userId_campaignId: { userId, campaignId } },
        create: { userId, campaignId },
        update: {},
        select: { id: true, couponsGrantedAt: true },
      });
      if (activation.couponsGrantedAt) return;

      const templates = await tx.couponTemplate.findMany({
        where: { campaignId, isActive: true },
        select: { id: true, validDays: true, validUntil: true },
      });

      const now = new Date();
      const grantedCouponIds: string[] = [];
      if (templates.length > 0) {
        // Skip templates this user already holds (normal idempotent path); the
        // (userId, templateId) unique index is the concurrency backstop.
        const existing = await tx.coupon.findMany({
          where: { userId, templateId: { in: templates.map((t) => t.id) } },
          select: { templateId: true },
        });
        const alreadyGranted = new Set(existing.map((c) => c.templateId));

        for (const template of templates) {
          if (alreadyGranted.has(template.id)) continue;
          const couponId = await this.createCouponWithUniqueCode(
            tx,
            userId,
            template.id,
            this.computeExpiry(template, now),
          );
          if (couponId) grantedCouponIds.push(couponId);
        }
      }

      await tx.campaignActivation.update({
        where: { id: activation.id },
        data: { couponsGrantedAt: now },
      });
      await tx.auditLog.create({
        data: {
          adminActorId: null,
          action: 'coupon.granted',
          metadata: { userId, campaignId, couponIds: grantedCouponIds },
        },
      });
    });
  }

  private computeExpiry(
    template: { validDays: number | null; validUntil: Date | null },
    now: Date,
  ): Date | null {
    if (template.validUntil) return template.validUntil;
    if (template.validDays) {
      return new Date(now.getTime() + template.validDays * MILLIS_PER_DAY);
    }
    return null;
  }

  private async createCouponWithUniqueCode(
    tx: Prisma.TransactionClient,
    userId: string,
    templateId: string,
    expiresAt: Date | null,
  ): Promise<string | null> {
    for (
      let attempt = 0;
      attempt < COUPON_CODE_GENERATION_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const code = generateHumanCode({ length: COUPON_CODE_LENGTH });
      try {
        const coupon = await tx.coupon.create({
          data: { userId, templateId, code, status: 'ISSUED', expiresAt },
          select: { id: true },
        });
        return coupon.id;
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        // (userId, templateId) collision → granted concurrently; treat as done.
        if (this.conflictTargetIncludes(error, 'templateId')) return null;
        // Otherwise it is a coupon-code collision → retry with a fresh code.
      }
    }
    throw new Error('Failed to generate a unique coupon code.');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private conflictTargetIncludes(error: unknown, field: string): boolean {
    const target = (error as { meta?: { target?: unknown } })?.meta?.target;
    if (Array.isArray(target)) return target.includes(field);
    if (typeof target === 'string') return target.includes(field);
    return false;
  }
}
