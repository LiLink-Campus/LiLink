import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  Length,
  Max,
  MaxLength,
  ValidateNested,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ADMIN_CYCLE_CODENAME_MAX_LENGTH,
  ADMIN_CYCLE_NOTES_MAX_LENGTH,
  ADMIN_DESCRIPTION_MAX_LENGTH,
  ADMIN_ID_MAX_LENGTH,
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_QUESTION_KEY_MAX_LENGTH,
  ADMIN_QUESTION_OPTION_LABEL_MAX_LENGTH,
  ADMIN_QUESTION_OPTION_VALUE_MAX_LENGTH,
  ADMIN_QUESTION_OPTIONS_MAX_ITEMS,
  ADMIN_QUESTION_PROMPT_MAX_LENGTH,
  ADMIN_QUESTION_REORDER_MAX_ITEMS,
  ADMIN_REPORT_BATCH_MAX_ITEMS,
  ADMIN_REPORT_REVIEW_NOTES_MAX_LENGTH,
  ADMIN_SCHOOL_DOMAIN_MAX_ITEMS,
  ADMIN_SCHOOL_DOMAIN_MAX_LENGTH,
  ADMIN_SCHOOL_NAME_MAX_LENGTH,
  ADMIN_SCHOOL_SLUG_MAX_LENGTH,
  ADMIN_SEARCH_MAX_LENGTH,
  ADMIN_SETTINGS_VALUE_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
} from '../../common/validation/input-limits';

class ListQueryDto {
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
}

export class ListSchoolsQueryDto extends ListQueryDto {}

export class ListCyclesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'PREPARING', 'REVEAL_READY', 'REVEALED'])
  status?: 'DRAFT' | 'OPEN' | 'PREPARING' | 'REVEAL_READY' | 'REVEALED';
}

export class ListCycleParticipantsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['OPTED_IN', 'OPTED_OUT'])
  status?: 'OPTED_IN' | 'OPTED_OUT';
}

export class ListCycleMatchesQueryDto extends ListQueryDto {}

export class ListCycleLogsQueryDto extends ListQueryDto {}

export class ListUsersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsIn(['all', 'submitted', 'missing'])
  questionnaire?: 'all' | 'submitted' | 'missing';

  @IsOptional()
  @IsIn(['all', 'test', 'real'])
  userType?: 'all' | 'test' | 'real';

  @IsOptional()
  @IsIn(['all', '男', '女', '非二元'])
  gender?: 'all' | '男' | '女' | '非二元';
}

export class ListUserParticipationsQueryDto extends ListQueryDto {}

export class ListReportsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
}

export class ListAuditLogsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_SEARCH_MAX_LENGTH)
  action?: string;
}

export class CreateSchoolDto {
  @IsString()
  @MaxLength(ADMIN_SCHOOL_NAME_MAX_LENGTH)
  name!: string;

  @IsString()
  @MaxLength(ADMIN_SCHOOL_SLUG_MAX_LENGTH)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens.',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_DESCRIPTION_MAX_LENGTH)
  description?: string;

  // When omitted, the school defaults to registration-eligible (schema default).
  @IsOptional()
  @IsBoolean()
  registrationEligible?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_SCHOOL_DOMAIN_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ADMIN_SCHOOL_DOMAIN_MAX_LENGTH, { each: true })
  domains!: string[];
}

export class UpdateSchoolDto {
  @IsString()
  @MaxLength(ADMIN_SCHOOL_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_DESCRIPTION_MAX_LENGTH)
  description?: string;

  // When omitted, the school's current eligibility is left unchanged.
  @IsOptional()
  @IsBoolean()
  registrationEligible?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_SCHOOL_DOMAIN_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ADMIN_SCHOOL_DOMAIN_MAX_LENGTH, { each: true })
  domains!: string[];
}

export class UpsertCycleDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  cycleId?: string;

  @IsString()
  @MaxLength(ADMIN_CYCLE_CODENAME_MAX_LENGTH)
  codename!: string;

  @IsDateString()
  participationDeadline!: string;

  @IsDateString()
  revealAt!: string;

  @IsIn(['DRAFT', 'OPEN', 'REVEAL_READY', 'REVEALED'])
  status!: 'DRAFT' | 'OPEN' | 'REVEAL_READY' | 'REVEALED';

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_CYCLE_NOTES_MAX_LENGTH)
  notes?: string;
}

export class RunCycleDto {
  @IsString()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  cycleId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class QuestionOptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_QUESTION_OPTION_VALUE_MAX_LENGTH)
  value?: string;

  @IsString()
  @MaxLength(ADMIN_QUESTION_OPTION_LABEL_MAX_LENGTH)
  label!: string;
}

export class UpsertQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  questionId?: string;

  @IsString()
  @MaxLength(ADMIN_QUESTION_KEY_MAX_LENGTH)
  key!: string;

  @IsString()
  @MaxLength(ADMIN_QUESTION_PROMPT_MAX_LENGTH)
  prompt!: string;

  @IsIn(['SINGLE_SELECT', 'MULTI_SELECT', 'SCALE'])
  type!: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'SCALE';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ADMIN_QUESTION_OPTIONS_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  selectionLimit?: number;

  @IsInt()
  @Min(1)
  order!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;
}

export class ReorderQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_QUESTION_REORDER_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ADMIN_ID_MAX_LENGTH, { each: true })
  questionIds!: string[];
}

export class ReviewReportDto {
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_REPORT_REVIEW_NOTES_MAX_LENGTH)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  suspendUser?: boolean;
}

export class BatchReviewReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ADMIN_REPORT_BATCH_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(ADMIN_ID_MAX_LENGTH, { each: true })
  reportIds!: string[];

  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_REPORT_REVIEW_NOTES_MAX_LENGTH)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  suspendUsers?: boolean;
}

export class UpdateUserStatusDto {
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status!: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(2, 30)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_ID_MAX_LENGTH)
  schoolId?: string | null;

  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}

export class UpdateUserReferralLimitDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  nonEduReferralLimit!: number;
}

export class ToggleTestFlagDto {
  @IsBoolean()
  isTest!: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(ADMIN_SETTINGS_VALUE_MAX_LENGTH)
  max_registrations?: string;
}
