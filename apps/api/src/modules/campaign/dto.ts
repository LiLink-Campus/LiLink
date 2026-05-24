import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CAMPAIGN_STATUSES, COUPON_BENEFIT_TYPES } from '@lilink/shared';
import {
  ADMIN_ID_MAX_LENGTH,
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_SLUG_MAX_LENGTH,
  COUPON_FACE_VALUE_MAX,
  COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH,
  COUPON_TEMPLATE_TITLE_MAX_LENGTH,
  COUPON_VALID_DAYS_MAX,
} from '../../common/validation/input-limits';

const CAMPAIGN_STATUS_VALUES = [...CAMPAIGN_STATUSES];
const COUPON_BENEFIT_TYPE_VALUES = [...COUPON_BENEFIT_TYPES];

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_SLUG_MAX_LENGTH)
  slug!: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  description?: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsIn(CAMPAIGN_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  description?: string;
}

export class ListCampaignsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_PAGE_MAX)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_PAGE_SIZE_MAX)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_SEARCH_MAX_LENGTH)
  search?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_STATUS_VALUES)
  status?: string;
}

export class CreateCouponTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  merchantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(COUPON_TEMPLATE_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsIn(COUPON_BENEFIT_TYPE_VALUES)
  benefitType!: string;

  @IsInt()
  @Min(0)
  @Max(COUPON_FACE_VALUE_MAX)
  faceValue!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(COUPON_VALID_DAYS_MAX)
  validDays?: number;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  // §A tiered rule (version + tiers[]). Loosely typed here; the service calls
  // validateCouponRule(rule, benefitType) which enforces the ladder shape and
  // benefitType consistency. Required for FULL_REDUCTION / DISCOUNT / GIFT;
  // omitted for CUSTOM.
  @IsOptional()
  @IsObject()
  rule?: Record<string, unknown>;
}

export class UpdateCouponTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(COUPON_TEMPLATE_TITLE_MAX_LENGTH)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @IsOptional()
  @IsIn(COUPON_BENEFIT_TYPE_VALUES)
  benefitType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(COUPON_FACE_VALUE_MAX)
  faceValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(COUPON_VALID_DAYS_MAX)
  validDays?: number;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  rule?: Record<string, unknown>;
}
