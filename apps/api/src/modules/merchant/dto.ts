import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MERCHANT_PROMOTION_MAX_BLOCKS } from '@lilink/shared';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  MERCHANT_CONTACT_MAX_LENGTH,
  MERCHANT_NAME_MAX_LENGTH,
} from '../../common/validation/input-limits';

export class CreateMerchantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MERCHANT_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_CONTACT_MAX_LENGTH)
  contactInfo?: string;
}

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MERCHANT_NAME_MAX_LENGTH)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_CONTACT_MAX_LENGTH)
  contactInfo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Block structure (type / https URL / length) is validated in the service via
  // validateMerchantPromotionBlocks; the discriminated union is hard to express
  // with class-validator decorators here.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MERCHANT_PROMOTION_MAX_BLOCKS)
  promotionBlocks?: unknown[];
}

export class ListMerchantsQueryDto {
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
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
