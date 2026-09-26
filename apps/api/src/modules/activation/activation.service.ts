import { Injectable, Logger } from '@nestjs/common';
import {
  COUPON_CODE_LENGTH,
  generateHumanCode,
  generateTotpSecret,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma/errors';

const COUPON_CODE_GENERATION_MAX_ATTEMPTS = 10;
const MILLIS_PER_DAY = 86_400_000;

@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grant the current activity once per qualified user; retry on later visits. */
  async tryGrantCoupons(userId: string): Promise<void> {
    try {
      if (!(await this.isQualified(this.prisma, userId))) return;
      // Completed activations are durable. Re-read the current campaign on every
      // visit so the shortcut cannot hide rewards from a newly published one.
      const campaigns = await this.prisma.campaign.findMany({
        where: { status: 'ACTIVE' },
        select: {
          startsAt: true,
          endsAt: true,
          activations: {
            where: { userId },
            select: { couponsGrantedAt: true },
          },
        },
        take: 2,
      });
      const campaign = campaigns[0];
      const now = new Date();
      if (
        campaigns.length !== 1 ||
        (campaign.startsAt && campaign.startsAt > now) ||
        (campaign.endsAt && campaign.endsAt <= now) ||
        campaign.activations[0]?.couponsGrantedAt
      )
        return;

      await this.grant(userId);
    } catch (error) {
      this.logger.warn(
        `tryGrantCoupons failed for ${userId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async isQualified(
    store: Pick<Prisma.TransactionClient, 'user'>,
    userId: string,
  ) {
    const user = await store.user.findUnique({
      where: { id: userId },
      select: {
        firstOptedInAt: true,
        status: true,
        deactivatedAt: true,
        questionnaireResponse: { select: { submittedAt: true } },
      },
    });
    return Boolean(
      user?.firstOptedInAt &&
      user.questionnaireResponse?.submittedAt &&
      user.status === 'ACTIVE' &&
      !user.deactivatedAt,
    );
  }

  private async grant(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Publication/end retain the exclusive lock. Recipients can grant in
      // parallel while an activation row serializes visits by the same user.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(70412026)`;
      if (!(await this.isQualified(tx, userId))) return;
      const now = new Date();
      const activeCampaigns = await tx.campaign.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, startsAt: true, endsAt: true },
        take: 2,
      });
      // Older releases allowed multiple ACTIVE campaigns. Operators must
      // explicitly end the extras before any one activity can grant rewards.
      if (activeCampaigns.length > 1) {
        this.logger.warn(
          'Coupon grants paused: multiple ACTIVE campaigns require operator resolution.',
        );
        return;
      }
      const campaign = activeCampaigns[0];
      if (!campaign) return;
      if (
        (campaign.startsAt && campaign.startsAt > now) ||
        (campaign.endsAt && campaign.endsAt <= now)
      )
        return;
      const campaignId = campaign.id;

      // Stable activation event; couponsGrantedAt is the idempotency gate.
      const activation = await tx.campaignActivation.upsert({
        where: { userId_campaignId: { userId, campaignId } },
        create: { userId, campaignId },
        // A real UPDATE locks the row and returns the latest committed gate.
        update: { userId },
        select: { id: true, couponsGrantedAt: true },
      });
      if (activation.couponsGrantedAt) return;

      const templates = await tx.couponTemplate.findMany({
        where: {
          campaignId,
          isActive: true,
          merchant: { isActive: true },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { id: true, validDays: true, validUntil: true },
      });

      if (templates.length === 0) return;
      const grantedCouponIds: string[] = [];
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
      const totpSecret = generateTotpSecret();
      try {
        const coupon = await tx.coupon.create({
          data: {
            userId,
            templateId,
            code,
            totpSecret,
            status: 'ISSUED',
            expiresAt,
          },
          select: { id: true },
        });
        return coupon.id;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // (userId, templateId) collision → granted concurrently; treat as done.
        if (this.conflictTargetIncludes(error, 'templateId')) return null;
        // Otherwise it is a coupon-code collision → retry with a fresh code.
      }
    }
    throw new Error('Failed to generate a unique coupon code.');
  }

  private conflictTargetIncludes(error: unknown, field: string): boolean {
    const target = (error as { meta?: { target?: unknown } })?.meta?.target;
    if (Array.isArray(target)) return target.includes(field);
    if (typeof target === 'string') return target.includes(field);
    return false;
  }
}
