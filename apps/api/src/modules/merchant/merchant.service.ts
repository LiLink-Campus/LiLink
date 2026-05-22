import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MerchantPromotionBlock,
  validateMerchantPromotionBlocks,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../../common/validation/input-limits';
import {
  CreateMerchantDto,
  ListMerchantsQueryDto,
  UpdateMerchantDto,
} from './dto';

interface MerchantRecord {
  id: string;
  name: string;
  contactInfo: string | null;
  promotionBlocks: Prisma.JsonValue | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a merchant. Name is not unique (distinct branches may share a name);
   * the audit row is written in the same transaction as the insert.
   */
  async createMerchant(input: CreateMerchantDto, adminActorId: string) {
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException('Merchant name is required.');
    }
    const contactInfo = input.contactInfo?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.merchant.create({ data: { name, contactInfo } });
      await tx.auditLog.create({
        data: {
          adminActorId,
          action: 'merchant.created',
          metadata: { merchantId: created.id },
        },
      });
      return this.toMerchantView(created);
    });
  }

  /**
   * Patch a merchant. Only supplied fields change; promotionBlocks are
   * structurally validated (type / https URL / length / count) before storage.
   * campaignId / merchantId of templates are never touched here.
   */
  async updateMerchant(
    id: string,
    input: UpdateMerchantDto,
    adminActorId: string,
  ) {
    const data: Prisma.MerchantUpdateInput = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('Merchant name is required.');
      data.name = name;
    }
    if (input.contactInfo !== undefined) {
      data.contactInfo = input.contactInfo.trim() || null;
    }
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }
    if (input.promotionBlocks !== undefined) {
      let blocks: MerchantPromotionBlock[];
      try {
        blocks = validateMerchantPromotionBlocks(input.promotionBlocks);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'Invalid promotion blocks.',
        );
      }
      data.promotionBlocks = blocks as unknown as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No updatable fields supplied.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.merchant.update({ where: { id }, data });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'merchant.updated',
            metadata: { merchantId: id, fields: Object.keys(data) },
          },
        });
        return this.toMerchantView(updated);
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Merchant not found.');
      }
      throw error;
    }
  }

  async listMerchants(query: ListMerchantsQueryDto) {
    const page = this.normalizePositiveInt(query.page, 1, ADMIN_LIST_PAGE_MAX);
    const pageSize = this.normalizePositiveInt(
      query.pageSize,
      20,
      ADMIN_LIST_PAGE_SIZE_MAX,
    );
    const skip = (page - 1) * pageSize;

    const where: Prisma.MerchantWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (query.status === 'active') where.isActive = true;
    else if (query.status === 'inactive') where.isActive = false;

    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          _count: { select: { templates: true, redemptions: true } },
        },
      }),
      this.prisma.merchant.count({ where }),
    ]);

    return {
      items: merchants.map((merchant) => ({
        ...this.toMerchantView(merchant),
        templateCount: merchant._count.templates,
        redemptionCount: merchant._count.redemptions,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private toMerchantView(merchant: MerchantRecord) {
    return {
      id: merchant.id,
      name: merchant.name,
      contactInfo: merchant.contactInfo,
      promotionBlocks: (merchant.promotionBlocks ??
        []) as unknown as MerchantPromotionBlock[],
      isActive: merchant.isActive,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
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

  private isRecordNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2025'
    );
  }
}
