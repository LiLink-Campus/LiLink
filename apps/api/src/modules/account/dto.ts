import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  schoolYear?: string;

  @IsOptional()
  @IsString()
  programName?: string;

  @IsOptional()
  @IsString()
  pronouns?: string;

  @IsOptional()
  @IsString()
  hometown?: string;

  @IsOptional()
  @IsString()
  genderIdentity?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  ageMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interestedIn?: string[];
}

export class SaveQuestionnaireDto {
  @IsObject()
  answers!: Record<string, unknown>;
}

export class ToggleParticipationDto {
  @IsBoolean()
  optIn!: boolean;
}

export class ReportMatchDto {
  @IsIn(['骚扰', '冒犯内容', '身份异常', '恶意行为', '其他'])
  reason!: '骚扰' | '冒犯内容' | '身份异常' | '恶意行为' | '其他';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  details?: string;
}

export enum DashboardHistoryResult {
  MATCHED = 'MATCHED',
  UNMATCHED = 'UNMATCHED',
  NOT_PARTICIPATED = 'NOT_PARTICIPATED',
}

export enum DashboardHistoryVisibility {
  VISIBLE = 'VISIBLE',
  LIMITED = 'LIMITED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum DashboardHistoryLimitedReason {
  REPORTED = 'REPORTED',
  BLOCKED = 'BLOCKED',
}

export class DashboardMatchParticipantResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  displayName!: string | null;

  @ApiProperty({ nullable: true })
  introLine!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  schoolName!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  contactRequestedAt!: string | null;
}

export class DashboardMatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ type: String, isArray: true })
  reasons!: string[];

  @ApiProperty({ nullable: true, format: 'date-time' })
  introducedAt!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  currentUserRequestedAt!: string | null;

  @ApiPropertyOptional({
    enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
    nullable: true,
  })
  reportStatus!: string | null;

  @ApiProperty({
    type: () => DashboardMatchParticipantResponseDto,
    isArray: true,
  })
  participants!: DashboardMatchParticipantResponseDto[];
}

export class DashboardHistoryItemResponseDto {
  @ApiProperty()
  cycleId!: string;

  @ApiProperty()
  codename!: string;

  @ApiProperty({ format: 'date-time' })
  revealAt!: string;

  @ApiProperty({ enum: ['OPTED_IN', 'OPTED_OUT'] })
  participationStatus!: 'OPTED_IN' | 'OPTED_OUT';

  @ApiProperty({ enum: DashboardHistoryResult })
  result!: DashboardHistoryResult;

  @ApiProperty({ enum: DashboardHistoryVisibility })
  visibility!: DashboardHistoryVisibility;

  @ApiPropertyOptional({ enum: DashboardHistoryLimitedReason, nullable: true })
  limitedReason!: DashboardHistoryLimitedReason | null;

  @ApiProperty({ type: () => DashboardMatchResponseDto, nullable: true })
  match!: DashboardMatchResponseDto | null;
}

export class DashboardCurrentCycleResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  codename!: string;

  @ApiProperty({ format: 'date-time' })
  revealAt!: string;

  @ApiProperty({ format: 'date-time' })
  participationDeadline!: string;

  @ApiProperty({ enum: ['DRAFT', 'OPEN', 'REVEAL_READY', 'REVEALED'] })
  status!: 'DRAFT' | 'OPEN' | 'REVEAL_READY' | 'REVEALED';

  @ApiProperty({ enum: ['OPTED_IN', 'OPTED_OUT'] })
  participationStatus!: 'OPTED_IN' | 'OPTED_OUT';
}

export class DashboardLastRevealedRoundResponseDto {
  @ApiProperty()
  cycleId!: string;

  @ApiProperty()
  codename!: string;

  @ApiProperty({ format: 'date-time' })
  revealAt!: string;

  @ApiProperty({ enum: ['OPTED_IN', 'OPTED_OUT'] })
  participationStatus!: 'OPTED_IN' | 'OPTED_OUT';

  @ApiProperty()
  matched!: boolean;
}

export class DashboardResponseDto {
  @ApiProperty({
    type: Object,
    nullable: true,
    additionalProperties: true,
  })
  profile!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  questionnaireSubmittedAt!: string | null;

  @ApiProperty({ type: () => DashboardCurrentCycleResponseDto, nullable: true })
  currentCycle!: DashboardCurrentCycleResponseDto | null;

  @ApiProperty({
    type: () => DashboardLastRevealedRoundResponseDto,
    nullable: true,
  })
  lastRevealedRound!: DashboardLastRevealedRoundResponseDto | null;

  @ApiProperty({ type: () => DashboardMatchResponseDto, nullable: true })
  latestMatch!: DashboardMatchResponseDto | null;

  @ApiProperty({
    type: () => DashboardHistoryItemResponseDto,
    isArray: true,
  })
  recentMatchHistory!: DashboardHistoryItemResponseDto[];
}
