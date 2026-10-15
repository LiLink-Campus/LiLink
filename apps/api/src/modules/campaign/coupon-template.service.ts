import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCouponTemplateDto, UpdateCouponTemplateDto } from './dto';

const include = {
  merchant: { select: { id: true, name: true } },
  redemptionGroup: { select: { name: true } },
  _count: { select: { coupons: true } },
} as const;

@Injectable()
export class CouponTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(campaignId: string) {
    if (!(await this.prisma.campaign.findUnique({ where: { id: campaignId } })))
      throw new NotFoundException('活动不存在。');
    const items = await this.prisma.couponTemplate.findMany({
      where: { campaignId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: items.map((t) => ({ ...t, couponCount: t._count.coupons })),
    };
  }

  async createTemplate(
    campaignId: string,
    input: CreateCouponTemplateDto,
    adminActorId: string,
  ) {
    this.validateExpiry(input);
    const title = this.required(input.title);
    const benefitText = this.required(input.benefitText);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(70412026)`;
      const campaign = await tx.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) throw new NotFoundException('活动不存在。');
      if (campaign.status !== 'DRAFT')
        throw new BadRequestException('只能为草稿活动添加优惠券。');
      if (!(await tx.merchant.findUnique({ where: { id: input.merchantId } })))
        throw new BadRequestException('商家不存在。');
      const redemptionGroupId = await this.group(
        tx,
        campaignId,
        input.merchantId,
        input.redemptionGroupName,
      );
      const created = await tx.couponTemplate.create({
        data: {
          campaignId,
          merchantId: input.merchantId,
          title,
          benefitText,
          redemptionGroupId,
          validDays: input.validDays ?? null,
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
        },
        include,
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
      return created;
    });
  }

  async updateTemplate(
    id: string,
    input: UpdateCouponTemplateDto,
    adminActorId: string,
  ) {
    this.validateExpiry(input);
    const data: Prisma.CouponTemplateUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = this.required(input.title);
    if (input.benefitText !== undefined)
      data.benefitText = this.required(input.benefitText);
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.validDays !== undefined) {
      data.validDays = input.validDays;
      data.validUntil = null;
    }
    if (input.validUntil !== undefined) {
      data.validUntil = new Date(input.validUntil);
      data.validDays = null;
    }
    if (!Object.keys(data).length && input.redemptionGroupName === undefined)
      throw new BadRequestException('没有可修改的字段。');
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(70412026)`;
      const template = await tx.couponTemplate.findUnique({
        where: { id },
        include: { campaign: true, _count: { select: { coupons: true } } },
      });
      if (!template) throw new NotFoundException('优惠券不存在。');
      if (template.campaign.status === 'ENDED')
        throw new BadRequestException('已结束活动的优惠券不能修改。');
      const contentChange =
        input.redemptionGroupName !== undefined ||
        Object.keys(data).some((k) => k !== 'isActive');
      if (
        contentChange &&
        (template.campaign.status !== 'DRAFT' || template._count.coupons > 0)
      )
        throw new BadRequestException('优惠券发布或发放后，只能启用或停用。');
      if (input.redemptionGroupName !== undefined)
        data.redemptionGroupId = await this.group(
          tx,
          template.campaignId,
          template.merchantId,
          input.redemptionGroupName,
        );
      const updated = await tx.couponTemplate.update({
        where: { id },
        data,
        include,
      });
      await tx.auditLog.create({
        data: {
          adminActorId,
          action: 'coupon_template.updated',
          metadata: { templateId: id, fields: Object.keys(data) },
        },
      });
      return updated;
    });
  }

  private async group(
    tx: Prisma.TransactionClient,
    campaignId: string,
    merchantId: string,
    raw?: string,
  ) {
    const name = raw?.trim();
    if (!name) return null;
    const group = await tx.couponRedemptionGroup.upsert({
      where: { campaignId_merchantId_name: { campaignId, merchantId, name } },
      create: { campaignId, merchantId, name },
      update: {},
      select: { id: true },
    });
    return group.id;
  }

  private required(value: string) {
    if (!value.trim())
      throw new BadRequestException('标题和优惠内容不能为空。');
    return value.trim();
  }

  private validateExpiry(input: { validDays?: number; validUntil?: string }) {
    if (input.validDays != null && input.validUntil != null)
      throw new BadRequestException('有效天数和截止时间只能选择一项。');
  }
}
