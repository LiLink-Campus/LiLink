import { Type } from 'class-transformer';
import {
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
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  INVITE_CODE_OWNER_NAME_MAX_LENGTH,
} from '../../common/validation/input-limits';

export class CreateInviteCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(INVITE_CODE_OWNER_NAME_MAX_LENGTH)
  ownerName!: string;
}

export class ListInviteCodesQueryDto {
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

export class SetInviteCodeActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
