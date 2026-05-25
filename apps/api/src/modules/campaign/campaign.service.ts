import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CampaignStatus,
  CouponBenefitType,
  validateCouponRule,
} from '@lilink/shared';
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
  CreateCouponTemplateDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
  UpdateCouponTemplateDto,
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

interface TemplateRecord {
  id: string;
  campaignId: string;
  merchantId: string;
  title: string;
  description: string | null;
  benefitType: string;
  faceValue: number;
  validDays: number | null;
  validUntil: Date | null;
  rule: Prisma.JsonValue | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  merchant?: { id: string; name: string; isActive: boolean };
  _count?: { coupons: number };
}

const TEMPLATE_INCLUDE = {
  merchant: { select: { id: true, name: true, isActive: true } },
  _count: { select: { coupons: true } },
} as const;

@Injectable()
export class CampaignService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Campaigns ----

  async createCampaign(input: CreateCampaignDto, adminActorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Campaign name is required.');
    const slug = this.normalizeSlug(input.slug);
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

  /**
   * Patch a campaign (status / isDefault / time window / description). slug and
   * name are immutable after creation. Promoting a campaign to ACTIVE+default
   * demotes any other current ACTIVE default in the same transaction so the
   * partial-unique index (isDefault && status=ACTIVE) never collides.
   */
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
    let effIsDefault = input.isDefault ?? current.isDefault;
    // An ENDED campaign can never be the default fallback; force it off so the
    // partial-unique slot frees up and the state stays clean.
    if (effStatus === 'ENDED') effIsDefault = false;

    if (input.status !== undefined) data.status = effStatus;
    if (effIsDefault !== current.isDefault) data.isDefault = effIsDefault;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (effStatus === 'ACTIVE' && effIsDefault) {
          await tx.campaign.updateMany({
            where: { status: 'ACTIVE', isDefault: true, id: { not: id } },
            data: { isDefault: false },
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

  // ---- Coupon templates ----

  async listTemplates(campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found.');

    const templates = await this.prisma.couponTemplate.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      include: TEMPLATE_INCLUDE,
    });
    return {
      items: templates.map((template) => this.toTemplateView(template)),
    };
  }

  async createTemplate(
    campaignId: string,
    input: CreateCouponTemplateDto,
    adminActorId: string,
  ) {
    const title = input.title.trim();
    if (!title) throw new BadRequestException('Template title is required.');
    if (input.validDays != null && input.validUntil != null) {
      throw new BadRequestException(
        'Provide at most one of validDays / validUntil.',
      );
    }
    const benefitType = input.benefitType as CouponBenefitType;
    const rule = this.parseRule(input.rule, benefitType);

    return this.prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true },
      });
      if (!campaign) throw new NotFoundException('Campaign not found.');
      const merchant = await tx.merchant.findUnique({
        where: { id: input.merchantId },
        select: { id: true, isActive: true },
      });
      if (!merchant) throw new BadRequestException('Merchant not found.');
      if (!merchant.isActive) {
        throw new BadRequestException('Merchant is inactive.');
      }

      const created = await tx.couponTemplate.create({
        data: {
          campaignId,
          merchantId: input.merchantId,
          title,
          description: input.description?.trim() || null,
          benefitType,
          faceValue: input.faceValue,
          validDays: input.validDays ?? null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          rule,
        },
        include: TEMPLATE_INCLUDE,
      });
      await tx.auditLog.create({
        data: {
          adminActorId,
          action: 'coupon_template.created',
          metadata: {
            templateId: created.id,
            campaignId,
            merchantId: input.merchantId,
          },
        },
      });
      return this.toTemplateView(created);
    });
  }

  /** Patch a coupon template. campaignId / merchantId are immutable. */
  async updateTemplate(
    id: string,
    input: UpdateCouponTemplateDto,
    adminActorId: string,
  ) {
    if (input.validDays != null && input.validUntil != null) {
      throw new BadRequestException(
        'Provide at most one of validDays / validUntil.',
      );
    }

    const data: Prisma.CouponTemplateUpdateInput = {};
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException('Template title is required.');
      data.title = title;
    }
    if (input.description !== undefined) {
      data.description = input.description.trim() || null;
    }
    if (input.faceValue !== undefined) data.faceValue = input.faceValue;
    // Switching expiry mode clears the other field so validDays / validUntil
    // never coexist (the contract allows at most one), even across PATCHes that
    // each set only one of them on a template that already has the other.
    if (input.validDays !== undefined) {
      data.validDays = input.validDays;
      data.validUntil = null;
    }
    if (input.validUntil !== undefined) {
      data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
      data.validDays = null;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;

    // benefitType + rule must stay consistent. If either changes, re-validate
    // the resulting pair against the current template. Switching to CUSTOM
    // clears the rule; switching between typed kinds needs a matching new rule.
    if (input.benefitType !== undefined || input.rule !== undefined) {
      const current = await this.prisma.couponTemplate.findUnique({
        where: { id },
        select: { benefitType: true, rule: true },
      });
      if (!current) throw new NotFoundException('Coupon template not found.');
      const benefitType = (input.benefitType ??
        current.benefitType) as CouponBenefitType;
      const effectiveRule =
        input.rule !== undefined
          ? input.rule
          : benefitType === 'CUSTOM'
            ? null
            : (current.rule ?? null);
      if (input.benefitType !== undefined) data.benefitType = benefitType;
      data.rule = this.parseRule(effectiveRule, benefitType);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No updatable fields supplied.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.couponTemplate.update({
          where: { id },
          data,
          include: TEMPLATE_INCLUDE,
        });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'coupon_template.updated',
            metadata: { templateId: id, fields: Object.keys(data) },
          },
        });
        return this.toTemplateView(updated);
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        throw new NotFoundException('Coupon template not found.');
      }
      throw error;
    }
  }

  // ---- helpers / views ----

  /**
   * Validate a coupon rule against its benefitType and return a Prisma JSON
   * value to store. CUSTOM (and a null rule) store DbNull; FULL_REDUCTION /
   * DISCOUNT / GIFT require and store the normalized tier ladder. Throws
   * BadRequest on any rule problem.
   */
  private parseRule(
    rule: unknown,
    benefitType: CouponBenefitType,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    try {
      const validated = validateCouponRule(rule ?? null, benefitType);
      return validated === null
        ? Prisma.DbNull
        : (validated as unknown as Prisma.InputJsonValue);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid coupon rule.',
      );
    }
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

  private toTemplateView(template: TemplateRecord) {
    return {
      id: template.id,
      campaignId: template.campaignId,
      merchantId: template.merchantId,
      title: template.title,
      description: template.description,
      benefitType: template.benefitType,
      faceValue: template.faceValue,
      validDays: template.validDays,
      validUntil: template.validUntil,
      rule: template.rule ?? null,
      isActive: template.isActive,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      merchant: template.merchant,
      couponCount: template._count?.coupons,
    };
  }
}
