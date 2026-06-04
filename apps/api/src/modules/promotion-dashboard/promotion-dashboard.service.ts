import { BadRequestException, Injectable } from '@nestjs/common';
import {
  deriveReferralSource,
  isReferralChannel,
  ReferralMedium,
  ReferralScene,
  splitReferralChannel,
} from '@lilink/shared';
import {
  addGender,
  emptyGenderBuckets,
  GENDER_KEYS,
  genderKey,
  GenderBuckets,
  GenderKey,
  resolveHardGender,
} from '../../common/analytics/gender';
import { PrismaService } from '../../common/prisma/prisma.service';
import { clampPositiveInt } from '../../common/pagination';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../../common/validation/input-limits';
import {
  PromotionLeaderboardQueryDto,
  PromotionQueryDto,
  PromotionRedemptionsQueryDto,
} from './dto';

const MAX_RANGE_DAYS = 370;
const MILLIS_PER_DAY = 86_400_000;

interface FunnelStep {
  key: string;
  count: number;
}

export interface ChannelBreakdownRow {
  medium: ReferralMedium;
  scene: ReferralScene | null;
  share: number;
  click: number;
}

export interface PromotionFunnelResponse {
  campaignId: string;
  steps: FunnelStep[];
  byGender: { gender: string; steps: FunnelStep[] }[];
  conversions: { from: string; to: string; rate: number }[];
  channelBreakdown: ChannelBreakdownRow[];
}

export interface PromotionLeaderboardRow {
  sourceType: string;
  refLabel: string;
  invited: number;
  registered: number;
  activated: number;
  granted: number;
  redeemed: number;
  byGender: GenderBuckets;
}

export interface PromotionCouponsRow {
  merchantId: string;
  merchantName: string;
  granted: number;
  redeemed: number;
}

export interface PromotionRedemptionRow {
  merchantId: string;
  merchantName: string;
  day: string;
  count: number;
  faceValueTotal: number;
}

/**
 * Live aggregation for the promotion dashboard. Every view is scoped to one
 * campaign + a required time range (bounded to MAX_RANGE_DAYS); isTest accounts
 * are excluded everywhere. byGender follows the register cohort (SHARE/CLICK are
 * anonymous events without a gender). A DailyCampaignStat rollup is reserved
 * (contract) for switching off live aggregation as data grows.
 */
@Injectable()
export class PromotionDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getFunnel(query: PromotionQueryDto): Promise<PromotionFunnelResponse> {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const range = { gte: from, lt: to };

    // Fetch SHARE + CLICK events with channel for breakdown; total counts are
    // derived from the same arrays so there are no extra round-trips.
    const [shareEvents, clickEvents] = await Promise.all([
      this.prisma.referralEvent.findMany({
        where: { type: 'SHARE', campaignId, createdAt: range },
        select: { channel: true },
      }),
      this.prisma.referralEvent.findMany({
        where: { type: 'CLICK', campaignId, createdAt: range },
        select: { channel: true },
      }),
    ]);

    const share = shareEvents.length;
    const click = clickEvents.length;

    // Register cohort: users attributed to this campaign who registered in the
    // range, with gender + downstream activation/grant/redeem flags.
    const users = await this.prisma.user.findMany({
      where: {
        referralCampaignId: campaignId,
        isTest: false,
        createdAt: range,
      },
      select: {
        questionnaireResponse: { select: { submittedAt: true, answers: true } },
        campaignActivations: {
          where: { campaignId },
          select: { id: true },
          take: 1,
        },
        coupons: {
          where: { template: { is: { campaignId } } },
          select: { redemption: { select: { id: true } } },
        },
      },
    });

    const buckets: Record<
      GenderKey,
      { register: number; activate: number; grant: number; redeem: number }
    > = {
      male: { register: 0, activate: 0, grant: 0, redeem: 0 },
      female: { register: 0, activate: 0, grant: 0, redeem: 0 },
      nonBinary: { register: 0, activate: 0, grant: 0, redeem: 0 },
      unknown: { register: 0, activate: 0, grant: 0, redeem: 0 },
    };
    let register = 0;
    let activate = 0;
    let grant = 0;
    let redeem = 0;
    for (const user of users) {
      const g = genderKey(resolveHardGender(user.questionnaireResponse));
      register += 1;
      buckets[g].register += 1;
      if (user.campaignActivations.length > 0) {
        activate += 1;
        buckets[g].activate += 1;
      }
      if (user.coupons.length > 0) {
        grant += 1;
        buckets[g].grant += 1;
      }
      if (user.coupons.some((coupon) => coupon.redemption !== null)) {
        redeem += 1;
        buckets[g].redeem += 1;
      }
    }

    const steps: FunnelStep[] = [
      { key: 'SHARE', count: share },
      { key: 'CLICK', count: click },
      { key: 'REGISTER', count: register },
      { key: 'ACTIVATE', count: activate },
      { key: 'GRANT', count: grant },
      { key: 'REDEEM', count: redeem },
    ];

    const byGender = GENDER_KEYS.map((key) => ({
      gender: this.genderLabel(key),
      steps: [
        { key: 'REGISTER', count: buckets[key].register },
        { key: 'ACTIVATE', count: buckets[key].activate },
        { key: 'GRANT', count: buckets[key].grant },
        { key: 'REDEEM', count: buckets[key].redeem },
      ],
    }));

    const channelBreakdown = this.aggregateChannelBreakdown(
      shareEvents,
      clickEvents,
    );

    return {
      campaignId,
      steps,
      byGender,
      conversions: this.computeConversions(steps),
      channelBreakdown,
    };
  }

  async getLeaderboard(query: PromotionLeaderboardQueryDto) {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const page = clampPositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = clampPositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );
    // source is normalized to UPPERCASE by the DTO Transform decorator.
    const source = query.source;

    // Build a DB-level pre-filter that narrows to the requested source bucket
    // before pulling the full user list into application memory.
    const sourceFilter =
      source === 'PERSONAL'
        ? { referredByUserId: { not: null } }
        : // DEFAULT: no personal referrer
          { referredByUserId: null };

    const users = await this.prisma.user.findMany({
      where: {
        isTest: false,
        createdAt: { gte: from, lt: to },
        referralCampaignId: campaignId,
        ...sourceFilter,
      },
      select: {
        referredByUserId: true,
        referredBy: { select: { referralCode: true, displayName: true } },
        questionnaireResponse: { select: { submittedAt: true, answers: true } },
        campaignActivations: {
          where: { campaignId },
          select: { id: true },
          take: 1,
        },
        coupons: {
          where: { template: { is: { campaignId } } },
          select: { redemption: { select: { id: true } } },
        },
      },
    });

    const rows = new Map<string, PromotionLeaderboardRow>();
    for (const user of users) {
      // Use shared helper so source derivation stays consistent across the app.
      const derivedSource = deriveReferralSource({
        referredByUserId: user.referredByUserId,
      });

      // Group key: referrer identity for PERSONAL; a fixed sentinel for DEFAULT
      // (all default-attributed users share the one DEFAULT row).
      const key =
        derivedSource === 'PERSONAL' ? user.referredByUserId! : '__DEFAULT__';

      const refLabel =
        derivedSource === 'PERSONAL'
          ? (user.referredBy?.displayName ??
            user.referredBy?.referralCode ??
            key)
          : 'DEFAULT';

      const row =
        rows.get(key) ??
        ({
          sourceType: derivedSource,
          refLabel,
          invited: 0,
          registered: 0,
          activated: 0,
          granted: 0,
          redeemed: 0,
          byGender: emptyGenderBuckets(),
        } satisfies PromotionLeaderboardRow);
      row.invited += 1;
      row.registered += 1;
      if (user.campaignActivations.length > 0) row.activated += 1;
      if (user.coupons.length > 0) row.granted += 1;
      if (user.coupons.some((coupon) => coupon.redemption !== null)) {
        row.redeemed += 1;
      }
      addGender(row.byGender, resolveHardGender(user.questionnaireResponse));
      rows.set(key, row);
    }

    const all = [...rows.values()].sort((a, b) => b.invited - a.invited);
    const total = all.length;
    const skip = (page - 1) * pageSize;
    return {
      items: all.slice(skip, skip + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getCoupons(query: PromotionQueryDto): Promise<{
    items: PromotionCouponsRow[];
  }> {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const range = { gte: from, lt: to };

    const templates = await this.prisma.couponTemplate.findMany({
      where: { campaignId },
      select: {
        id: true,
        merchantId: true,
        merchant: { select: { name: true } },
      },
    });
    const merchantByTemplate = new Map<string, string>();
    const merchantNames = new Map<string, string>();
    for (const template of templates) {
      merchantByTemplate.set(template.id, template.merchantId);
      merchantNames.set(template.merchantId, template.merchant.name);
    }
    const merchantIds = [...merchantNames.keys()];
    if (merchantIds.length === 0) {
      return { items: [] };
    }

    const [grantedGroups, redeemedGroups] = await Promise.all([
      this.prisma.coupon.groupBy({
        by: ['templateId'],
        where: {
          issuedAt: range,
          user: { is: { isTest: false } },
          template: { is: { campaignId } },
        },
        _count: { _all: true },
      }),
      this.prisma.redemption.groupBy({
        by: ['merchantId'],
        where: {
          merchantId: { in: merchantIds },
          redeemedAt: range,
          coupon: {
            is: {
              user: { is: { isTest: false } },
              template: { is: { campaignId } },
            },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const granted = new Map<string, number>();
    for (const group of grantedGroups) {
      const merchantId = merchantByTemplate.get(group.templateId);
      if (!merchantId) continue;
      granted.set(
        merchantId,
        (granted.get(merchantId) ?? 0) + group._count._all,
      );
    }
    const redeemed = new Map<string, number>();
    for (const group of redeemedGroups) {
      redeemed.set(group.merchantId, group._count._all);
    }

    const rows: PromotionCouponsRow[] = merchantIds.map((merchantId) => ({
      merchantId,
      merchantName: merchantNames.get(merchantId) ?? '',
      granted: granted.get(merchantId) ?? 0,
      redeemed: redeemed.get(merchantId) ?? 0,
    }));
    rows.sort((a, b) => b.granted - a.granted);
    return { items: rows };
  }

  async getRedemptions(query: PromotionRedemptionsQueryDto) {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const page = clampPositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = clampPositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );

    const redemptions = await this.prisma.redemption.findMany({
      where: {
        redeemedAt: { gte: from, lt: to },
        coupon: {
          is: {
            user: { is: { isTest: false } },
            template: { is: { campaignId } },
          },
        },
      },
      select: {
        merchantId: true,
        merchant: { select: { name: true } },
        redeemedAt: true,
        faceValueSnapshot: true,
      },
    });

    const rows = new Map<string, PromotionRedemptionRow>();
    for (const redemption of redemptions) {
      const day = this.shanghaiDay(redemption.redeemedAt);
      const key = `${redemption.merchantId}\n${day}`;
      const row =
        rows.get(key) ??
        ({
          merchantId: redemption.merchantId,
          merchantName: redemption.merchant.name,
          day,
          count: 0,
          faceValueTotal: 0,
        } satisfies PromotionRedemptionRow);
      row.count += 1;
      row.faceValueTotal += redemption.faceValueSnapshot;
      rows.set(key, row);
    }

    const all = [...rows.values()].sort(
      (a, b) =>
        b.day.localeCompare(a.day) || a.merchantId.localeCompare(b.merchantId),
    );
    const total = all.length;
    const skip = (page - 1) * pageSize;
    return {
      items: all.slice(skip, skip + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  // ---- helpers ----

  /**
   * Groups SHARE and CLICK events by their derived medium/scene dimensions.
   * Application-level grouping is acceptable at campus event volumes.
   */
  private aggregateChannelBreakdown(
    shareEvents: { channel: string | null }[],
    clickEvents: { channel: string | null }[],
  ): ChannelBreakdownRow[] {
    // Stable key: "medium:scene" (scene may be "null")
    const buckets = new Map<
      string,
      {
        medium: ReferralMedium;
        scene: ReferralScene | null;
        share: number;
        click: number;
      }
    >();

    const bucketKey = (medium: ReferralMedium, scene: ReferralScene | null) =>
      `${medium}:${String(scene)}`;

    const ensureBucket = (
      medium: ReferralMedium,
      scene: ReferralScene | null,
    ) => {
      const k = bucketKey(medium, scene);
      if (!buckets.has(k)) {
        buckets.set(k, { medium, scene, share: 0, click: 0 });
      }
      return buckets.get(k)!;
    };

    for (const ev of shareEvents) {
      if (!isReferralChannel(ev.channel)) continue;
      const { medium, scene } = splitReferralChannel(ev.channel);
      ensureBucket(medium, scene).share += 1;
    }
    for (const ev of clickEvents) {
      if (!isReferralChannel(ev.channel)) continue;
      const { medium, scene } = splitReferralChannel(ev.channel);
      ensureBucket(medium, scene).click += 1;
    }

    return [...buckets.values()].sort((a, b) => {
      const total = b.share + b.click - (a.share + a.click);
      if (total !== 0) return total;
      return a.medium.localeCompare(b.medium);
    });
  }

  private computeConversions(steps: FunnelStep[]) {
    const conversions: { from: string; to: string; rate: number }[] = [];
    for (let i = 1; i < steps.length; i += 1) {
      const prev = steps[i - 1].count;
      conversions.push({
        from: steps[i - 1].key,
        to: steps[i].key,
        rate: prev > 0 ? steps[i].count / prev : 0,
      });
    }
    return conversions;
  }

  private parseRange(query: PromotionQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from.getTime() >= to.getTime()
    ) {
      throw new BadRequestException('from must be a valid time before to.');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * MILLIS_PER_DAY) {
      throw new BadRequestException(
        `Time range must not exceed ${MAX_RANGE_DAYS} days.`,
      );
    }
    return { from, to };
  }

  private shanghaiDay(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private genderLabel(key: GenderKey): string {
    switch (key) {
      case 'male':
        return '男';
      case 'female':
        return '女';
      case 'nonBinary':
        return '非二元';
      default:
        return 'unknown';
    }
  }
}
