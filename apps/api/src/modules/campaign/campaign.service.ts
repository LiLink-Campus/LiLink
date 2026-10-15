import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CampaignStatus } from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  isRecordNotFoundError,
  isUniqueConstraintError,
} from '../../common/prisma/errors';
import { clampPositiveInt } from '../../common/pagination';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../../common/validation/input-limits';
import {
  CreateCampaignDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
} from './dto';

interface CampaignRecord {
  id: string;
  name: string;
  slug: string;
  status: string;
  isDefault: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class CampaignService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Campaigns ----

  async createCampaign(input: CreateCampaignDto, adminActorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Campaign name is required.');
    const slug = this.normalizeSlug(input.slug ?? `activity-${randomUUID()}`);
    const { startsAt, endsAt } = this.resolveWindow(
      input.startsAt,
      input.endsAt,
    );
    const description = input.description?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.campaign.create({
          data: { name, slug, description, startsAt, endsAt },
        });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'campaign.created',
            metadata: { campaignId: created.id, slug },
          },
        });
        return this.toCampaignView(created);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BadRequestException('Campaign slug already exists.');
      }
      throw error;
    }
  }

  /** Publish at most one global activity; keep ended activity history. */
  async updateCampaign(
    id: string,
    input: UpdateCampaignDto,
    adminActorId: string,
  ) {
    if (
      input.status === undefined &&
      input.isDefault === undefined &&
      input.startsAt === undefined &&
      input.endsAt === undefined &&
      input.description === undefined
    ) {
      throw new BadRequestException('No updatable fields supplied.');
    }

    const current = await this.prisma.campaign.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Campaign not found.');

    const data: Prisma.CampaignUpdateInput = {};
    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }

    const effStartsAt =
      input.startsAt !== undefined
        ? new Date(input.startsAt)
        : current.startsAt;
    const effEndsAt =
      input.endsAt !== undefined ? new Date(input.endsAt) : current.endsAt;
    if (
      effStartsAt &&
      effEndsAt &&
      effStartsAt.getTime() >= effEndsAt.getTime()
    ) {
      throw new BadRequestException('startsAt must be before endsAt.');
    }
    if (input.startsAt !== undefined) data.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = new Date(input.endsAt);

    const effStatus = (input.status ?? current.status) as CampaignStatus;
    data.isDefault = false;
    if (input.status !== undefined) data.status = effStatus;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(70412026)`;
        const latest = await tx.campaign.findUnique({ where: { id } });
        if (!latest) throw new NotFoundException('Campaign not found.');
        if (
          latest.status === 'ENDED' &&
          input.status &&
          input.status !== 'ENDED'
        ) {
          throw new BadRequestException(
            '已结束的活动不能重新发布，请新建活动。',
          );
        }
        if (input.status === 'DRAFT' && latest.status === 'ACTIVE') {
          throw new BadRequestException('进行中的活动只能结束，不能退回草稿。');
        }
        if (effStatus === 'ACTIVE') {
          const other = await tx.campaign.findFirst({
            where: { status: 'ACTIVE', id: { not: id } },
          });
          if (other)
            throw new BadRequestException(
              '已有进行中的活动，请先结束当前活动。',
            );
          const usable = await tx.couponTemplate.count({
            where: {
              campaignId: id,
              isActive: true,
              OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
            },
          });
          if (!usable)
            throw new BadRequestException(
              '请先添加至少一张已启用且未到期的优惠券。',
            );
        }
        if (input.status === 'ENDED') {
          await tx.couponTemplate.updateMany({
            where: { campaignId: id, isActive: true },
            data: { isActive: false },
          });
        }
        const updated = await tx.campaign.update({ where: { id }, data });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'campaign.updated',
            metadata: { campaignId: id, fields: Object.keys(data) },
          },
        });
        return this.toCampaignView(updated);
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Campaign not found.');
      }
      if (isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'Another ACTIVE default campaign already exists.',
        );
      }
      throw error;
    }
  }

  async getResults(campaignId: string) {
    if (
      !(await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Campaign not found.');
    const coupons = await this.prisma.coupon.findMany({
      where: {
        template: { campaignId },
        user: { isTest: false },
      },
      select: {
        userId: true,
        status: true,
        expiresAt: true,
        redemption: { select: { redeemedAt: true } },
        template: {
          select: {
            title: true,
            id: true,
            merchant: { select: { name: true } },
          },
        },
      },
    });
    const templates = new Map<
      string,
      { title: string; merchant: string; issued: number; redeemed: number }
    >();
    for (const coupon of coupons) {
      const row = templates.get(coupon.template.id) ?? {
        title: coupon.template.title,
        merchant: coupon.template.merchant.name,
        issued: 0,
        redeemed: 0,
      };
      row.issued += 1;
      if (coupon.redemption) row.redeemed += 1;
      templates.set(coupon.template.id, row);
    }
    return {
      recipients: new Set(coupons.map((c) => c.userId)).size,
      issued: coupons.length,
      redeemed: coupons.filter((c) => c.redemption).length,
      expired: coupons.filter(
        (c) =>
          !c.redemption &&
          (c.status === 'EXPIRED' ||
            (c.status === 'ISSUED' && c.expiresAt && c.expiresAt < new Date())),
      ).length,
      templates: [...templates.values()],
    };
  }

  async listCampaigns(query: ListCampaignsQueryDto) {
    const page = clampPositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = clampPositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.CampaignWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search.toLowerCase(), mode: 'insensitive' } },
      ];
    }
    if (query.status) where.status = query.status as CampaignStatus;

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: { select: { couponTemplates: true, activations: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      items: campaigns.map((campaign) => ({
        ...this.toCampaignView(campaign),
        templateCount: campaign._count.couponTemplates,
        activationCount: campaign._count.activations,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private resolveWindow(startsAtRaw?: string, endsAtRaw?: string) {
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : null;
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
    if (startsAt && endsAt && startsAt.getTime() >= endsAt.getTime()) {
      throw new BadRequestException('startsAt must be before endsAt.');
    }
    return { startsAt, endsAt };
  }

  private normalizeSlug(raw: string): string {
    const slug = raw.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new BadRequestException(
        'Slug must start with a letter or digit and contain only lowercase letters, digits, and dashes.',
      );
    }
    return slug;
  }

  private toCampaignView(campaign: CampaignRecord) {
    return {
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      status: campaign.status,
      isDefault: campaign.isDefault,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      description: campaign.description,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
