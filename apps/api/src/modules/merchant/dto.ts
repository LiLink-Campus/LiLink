import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  MERCHANT_PROMOTION_MAX_BLOCKS,
  MERCHANT_USER_ROLES,
} from '@lilink/shared';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  MERCHANT_CONTACT_MAX_LENGTH,
  MERCHANT_NAME_MAX_LENGTH,
  MERCHANT_USER_DISPLAY_NAME_MAX,
  MERCHANT_USER_PASSWORD_MAX,
  MERCHANT_USER_PASSWORD_MIN,
} from '../../common/validation/input-limits';

const MERCHANT_USER_ROLE_VALUES = [...MERCHANT_USER_ROLES];

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

export class CreateMerchantUserDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(MERCHANT_USER_PASSWORD_MIN)
  @MaxLength(MERCHANT_USER_PASSWORD_MAX)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_USER_DISPLAY_NAME_MAX)
  displayName?: string;

  @IsIn(MERCHANT_USER_ROLE_VALUES)
  role!: string;
}

export class UpdateMerchantUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Supplying a password resets it (re-hashed); omit to leave it unchanged.
  @IsOptional()
  @IsString()
  @MinLength(MERCHANT_USER_PASSWORD_MIN)
  @MaxLength(MERCHANT_USER_PASSWORD_MAX)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MERCHANT_USER_DISPLAY_NAME_MAX)
  displayName?: string;

  @IsOptional()
  @IsIn(MERCHANT_USER_ROLE_VALUES)
  role?: string;
}
