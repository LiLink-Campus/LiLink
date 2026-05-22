import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  readSingleChoice,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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

type GenderKey = 'male' | 'female' | 'nonBinary' | 'unknown';
const GENDER_KEYS: GenderKey[] = ['male', 'female', 'nonBinary', 'unknown'];

interface GenderBuckets {
  male: number;
  female: number;
  nonBinary: number;
  unknown: number;
}

interface FunnelStep {
  key: string;
  count: number;
}

export interface PromotionFunnelResponse {
  campaignId: string;
  steps: FunnelStep[];
  byGender: { gender: string; steps: FunnelStep[] }[];
  conversions: { from: string; to: string; rate: number }[];
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

    const [share, click] = await Promise.all([
      this.prisma.referralEvent.count({
        where: { type: 'SHARE', campaignId, createdAt: range },
      }),
      this.prisma.referralEvent.count({
        where: { type: 'CLICK', campaignId, createdAt: range },
      }),
    ]);

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
      const g = this.genderKey(this.resolveGender(user.questionnaireResponse));
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

    return {
      campaignId,
      steps,
      byGender,
      conversions: this.computeConversions(steps),
    };
  }

  async getLeaderboard(query: PromotionLeaderboardQueryDto) {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const page = this.normalizePositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = this.normalizePositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );
    const isPersonal = query.source === 'personal';

    const users = await this.prisma.user.findMany({
      where: {
        isTest: false,
        createdAt: { gte: from, lt: to },
        referralCampaignId: campaignId,
        ...(isPersonal
          ? { referredByUserId: { not: null } }
          : { inviteCodeId: { not: null } }),
      },
      select: {
        referredByUserId: true,
        referredBy: { select: { referralCode: true, displayName: true } },
        inviteCodeId: true,
        inviteCode: { select: { ownerName: true } },
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
      const key = isPersonal ? user.referredByUserId : user.inviteCodeId;
      if (!key) continue;
      const refLabel = isPersonal
        ? (user.referredBy?.displayName ?? user.referredBy?.referralCode ?? key)
        : (user.inviteCode?.ownerName ?? key);
      const row =
        rows.get(key) ??
        ({
          sourceType: query.source,
          refLabel,
          invited: 0,
          registered: 0,
          activated: 0,
          granted: 0,
          redeemed: 0,
          byGender: { male: 0, female: 0, nonBinary: 0, unknown: 0 },
        } satisfies PromotionLeaderboardRow);
      row.invited += 1;
      row.registered += 1;
      if (user.campaignActivations.length > 0) row.activated += 1;
      if (user.coupons.length > 0) row.granted += 1;
      if (user.coupons.some((coupon) => coupon.redemption !== null)) {
        row.redeemed += 1;
      }
      this.addGender(
        row.byGender,
        this.resolveGender(user.questionnaireResponse),
      );
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
      select: { merchantId: true, merchant: { select: { name: true } } },
    });
    const merchantNames = new Map<string, string>();
    for (const template of templates) {
      merchantNames.set(template.merchantId, template.merchant.name);
    }

    const rows = await Promise.all(
      [...merchantNames.keys()].map(async (merchantId) => {
        const [granted, redeemed] = await Promise.all([
          this.prisma.coupon.count({
            where: {
              issuedAt: range,
              user: { is: { isTest: false } },
              template: { is: { merchantId, campaignId } },
            },
          }),
          this.prisma.redemption.count({
            where: {
              merchantId,
              redeemedAt: range,
              coupon: {
                is: {
                  user: { is: { isTest: false } },
                  template: { is: { campaignId } },
                },
              },
            },
          }),
        ]);
        return {
          merchantId,
          merchantName: merchantNames.get(merchantId) ?? '',
          granted,
          redeemed,
        };
      }),
    );

    rows.sort((a, b) => b.granted - a.granted);
    return { items: rows };
  }

  async getRedemptions(query: PromotionRedemptionsQueryDto) {
    const { from, to } = this.parseRange(query);
    const campaignId = query.campaignId;
    const page = this.normalizePositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = this.normalizePositiveInt(
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

  private resolveGender(
    response: { submittedAt: Date | null; answers: Prisma.JsonValue } | null,
  ): string | null {
    if (!response?.submittedAt) return null;
    const answers = response.answers;
    if (
      typeof answers !== 'object' ||
      answers === null ||
      Array.isArray(answers)
    ) {
      return null;
    }
    return readSingleChoice(
      (answers as Record<string, unknown>)[HARD_MATCH_KEYS.gender],
      HARD_MATCH_GENDERS,
    );
  }

  private genderKey(gender: string | null): GenderKey {
    switch (gender) {
      case '男':
        return 'male';
      case '女':
        return 'female';
      case '非二元':
        return 'nonBinary';
      default:
        return 'unknown';
    }
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

  private addGender(buckets: GenderBuckets, gender: string | null): void {
    buckets[this.genderKey(gender)] += 1;
  }

  private normalizePositiveInt(
    value: number | undefined,
    fallback: number,
    max: number,
  ): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    const int = Math.floor(value);
    if (int < 1) return fallback;
    return Math.min(int, max);
  }
}
