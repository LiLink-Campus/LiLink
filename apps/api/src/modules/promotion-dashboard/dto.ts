import { Transform, Type } from 'class-transformer';
import {
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
import { REFERRAL_SOURCE_TYPES } from '@lilink/shared';
import {
  ADMIN_ID_MAX_LENGTH,
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../../common/validation/input-limits';

export class PromotionQueryDto {
  // Required: every dashboard view is scoped to a single campaign + time range
  // (contract); cross-campaign aggregation is not allowed.
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  campaignId!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}

export class PromotionLeaderboardQueryDto extends PromotionQueryDto {
  // Normalize query-string casing, then accept only PERSONAL or DEFAULT.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn([...REFERRAL_SOURCE_TYPES])
  source!: string;

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
}

export class PromotionRedemptionsQueryDto extends PromotionQueryDto {
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
}
