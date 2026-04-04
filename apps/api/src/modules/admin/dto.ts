import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  ValidateNested,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QUESTION_REASON_RULE_TYPES } from '../questionnaire/questionnaire-config';

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ListSchoolsQueryDto extends ListQueryDto {}

export class ListCyclesQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'REVEAL_READY', 'REVEALED'])
  status?: 'DRAFT' | 'OPEN' | 'REVEAL_READY' | 'REVEALED';
}

export class ListUsersQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsIn(['all', 'submitted', 'missing'])
  questionnaire?: 'all' | 'submitted' | 'missing';
}

export class ListReportsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
}

export class ListAuditLogsQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  action?: string;
}

export class CreateSchoolDto {
  @IsString()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens.',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  domains!: string[];
}

export class UpdateSchoolDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  domains!: string[];
}

export class UpsertCycleDto {
  @IsOptional()
  @IsString()
  cycleId?: string;

  @IsString()
  codename!: string;

  @IsDateString()
  participationDeadline!: string;

  @IsDateString()
  revealAt!: string;

  @IsIn(['DRAFT', 'OPEN', 'REVEAL_READY', 'REVEALED'])
  status!: 'DRAFT' | 'OPEN' | 'REVEAL_READY' | 'REVEALED';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RunCycleDto {
  @IsString()
  cycleId!: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class QuestionOptionDto {
  @IsOptional()
  @IsString()
  value?: string;

  @IsString()
  label!: string;
}

export class QuestionReasonRuleDto {
  @IsIn(QUESTION_REASON_RULE_TYPES)
  type!: (typeof QUESTION_REASON_RULE_TYPES)[number];

  @IsString()
  template!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOverlap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxLabels?: number;
}

export class UpsertQuestionDto {
  @IsOptional()
  @IsString()
  questionId?: string;

  @IsString()
  key!: string;

  @IsString()
  prompt!: string;

  @IsIn(['SINGLE_SELECT', 'MULTI_SELECT', 'SCALE'])
  type!: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'SCALE';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionReasonRuleDto)
  reasonRules?: QuestionReasonRuleDto[];

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
  @IsString({ each: true })
  questionIds!: string[];
}

export class DeleteQuestionDto {
  @IsString()
  questionId!: string;
}

export class ReviewReportDto {
  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  suspendUser?: boolean;
}

export class BatchReviewReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  reportIds!: string[];

  @IsIn(['OPEN', 'RESOLVED', 'DISMISSED'])
  status!: 'OPEN' | 'RESOLVED' | 'DISMISSED';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  suspendUsers?: boolean;
}

export class UpdateUserStatusDto {
  @IsIn(['PENDING', 'ACTIVE', 'SUSPENDED'])
  status!: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
}
