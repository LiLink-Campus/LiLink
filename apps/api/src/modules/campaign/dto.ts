import { Type } from 'class-transformer';
import {
  ValidateIf,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CAMPAIGN_STATUSES } from '@lilink/shared';
import {
  ADMIN_ID_MAX_LENGTH,
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_SLUG_MAX_LENGTH,
  COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH,
  COUPON_TEMPLATE_TITLE_MAX_LENGTH,
  COUPON_VALID_DAYS_MAX,
} from '../../common/validation/input-limits';

const CAMPAIGN_STATUS_VALUES = [...CAMPAIGN_STATUSES];

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(CAMPAIGN_SLUG_MAX_LENGTH)
  slug?: string;

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH)
  benefitText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  redemptionGroupName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(COUPON_VALID_DAYS_MAX)
  validDays?: number;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}

export class UpdateCouponTemplateDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COUPON_TEMPLATE_TITLE_MAX_LENGTH)
  title?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(COUPON_TEMPLATE_DESCRIPTION_MAX_LENGTH)
  benefitText?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(80)
  redemptionGroupName?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(COUPON_VALID_DAYS_MAX)
  validDays?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsISO8601()
  validUntil?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
