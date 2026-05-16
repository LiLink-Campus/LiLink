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
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTACT_CHANNEL_TYPES,
  EDITABLE_CONTACT_CHANNEL_TYPES,
  MAX_MEETUP_EXPIRATION_WEEKS,
  MEETUP_PROGRESS_STATUSES,
  MEETUP_TODO_PRIORITY,
  MEETUP_USER_TURN_STATUSES,
  MIN_MEETUP_EXPIRATION_WEEKS,
  SUPPORTED_LOCALES,
  WEEKLY_INTENTS,
  type MeetupProgressStatus,
  type MeetupUserTurnStatus,
  type ContactChannelType,
  type EditableContactChannelType,
  type SupportedLocale,
  type WeeklyIntent,
} from '@lilink/shared';

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

  @IsObject()
  hardMatchForm!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class SaveQuestionnaireResultDto {
  @ApiProperty({ enum: ['DRAFT', 'SUBMITTED'] })
  saveState!: 'DRAFT' | 'SUBMITTED';

  @ApiProperty({ format: 'date-time', nullable: true })
  questionnaireSubmittedAt!: string | null;

  @ApiProperty()
  hasDraft!: boolean;
}

export class AcknowledgeQuestionnaireItemsDto {
  @IsString()
  versionId!: string;

  @IsArray()
  @IsString({ each: true })
  keys!: string[];
}

export class ToggleParticipationDto {
  @IsBoolean()
  optIn!: boolean;

  // Required when opting in; ignored otherwise. Strict contract: opting in
  // without an intent must fail the request rather than silently default.
  @ValidateIf((dto: ToggleParticipationDto) => dto.optIn === true)
  @IsIn(WEEKLY_INTENTS as unknown as string[])
  intent?: WeeklyIntent;
}

export class UpdateLocaleDto {
  @IsIn(SUPPORTED_LOCALES as unknown as string[])
  locale!: SupportedLocale;
}

export class ContactMethodDto {
  @IsIn(EDITABLE_CONTACT_CHANNEL_TYPES as unknown as string[])
  type!: EditableContactChannelType;

  @IsString()
  value!: string;
}

export class UpdateContactPreferencesDto {
  @IsIn(CONTACT_CHANNEL_TYPES as unknown as string[])
  preferredContactChannel!: ContactChannelType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactMethodDto)
  methods!: ContactMethodDto[];
}

export class ContactMethodResponseDto {
  @ApiProperty({ enum: EDITABLE_CONTACT_CHANNEL_TYPES as unknown as string[] })
  type!: EditableContactChannelType;

  @ApiProperty()
  value!: string;
}

export class ContactPreferencesResponseDto {
  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: CONTACT_CHANNEL_TYPES as unknown as string[] })
  preferredContactChannel!: ContactChannelType;

  @ApiProperty({ type: () => ContactMethodResponseDto, isArray: true })
  methods!: ContactMethodResponseDto[];
}

export class DashboardPublicContactResponseDto {
  @ApiProperty({ enum: CONTACT_CHANNEL_TYPES as unknown as string[] })
  type!: ContactChannelType;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string;
}

export class UpdateMeetupSettingsDto {
  @IsInt()
  @Min(MIN_MEETUP_EXPIRATION_WEEKS)
  @Max(MAX_MEETUP_EXPIRATION_WEEKS)
  meetupExpirationWeeks!: 1 | 2 | 3 | 4;
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
  // LIMITED hides match-card details today; it is not a meetup access gate.
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

  @ApiProperty({
    type: () => DashboardPublicContactResponseDto,
    nullable: true,
  })
  contact!: DashboardPublicContactResponseDto | null;

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

  @ApiProperty({ nullable: true })
  reason!: string | null;

  @ApiProperty({ type: String, isArray: true })
  conversationTopics!: string[];

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

  @ApiProperty({
    enum: ['DRAFT', 'OPEN', 'PREPARING', 'REVEAL_READY', 'REVEALED'],
  })
  status!: 'DRAFT' | 'OPEN' | 'PREPARING' | 'REVEAL_READY' | 'REVEALED';

  @ApiProperty({ enum: ['OPTED_IN', 'OPTED_OUT'] })
  participationStatus!: 'OPTED_IN' | 'OPTED_OUT';

  @ApiPropertyOptional({
    enum: WEEKLY_INTENTS as unknown as string[],
    nullable: true,
    description:
      'Weekly matching intent (FRIEND/DATE/BOTH). Sticky carry-over preserves the last stored value for opted-in users; null means this participation still lacks a usable intent and will be excluded from matching.',
  })
  intent!: WeeklyIntent | null;
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

export class DashboardTaskResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['MEETUP'] })
  type!: 'MEETUP';

  @ApiProperty({ default: MEETUP_TODO_PRIORITY })
  priority!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  text!: string;

  @ApiProperty()
  href!: string;

  @ApiProperty({ enum: MEETUP_USER_TURN_STATUSES as unknown as string[] })
  userTurnStatus!: MeetupUserTurnStatus;

  @ApiProperty({ enum: MEETUP_PROGRESS_STATUSES as unknown as string[] })
  progressStatus!: MeetupProgressStatus;

  @ApiProperty()
  matchId!: string;

  @ApiProperty({ nullable: true })
  sessionId!: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class DashboardMeetupSummaryResponseDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  matchId!: string;

  @ApiProperty({
    enum: ['ACTIVE', 'LOCKED', 'CANCELED', 'EXPIRED', 'ARCHIVED'],
  })
  status!: 'ACTIVE' | 'LOCKED' | 'CANCELED' | 'EXPIRED' | 'ARCHIVED';

  @ApiProperty({ enum: MEETUP_PROGRESS_STATUSES as unknown as string[] })
  progressStatus!: MeetupProgressStatus;

  @ApiProperty()
  href!: string;

  @ApiProperty({ nullable: true, format: 'date-time' })
  confirmedStartsAt!: string | null;

  @ApiProperty({ nullable: true, format: 'date-time' })
  confirmedEndsAt!: string | null;

  @ApiProperty({ nullable: true })
  confirmedPlaceName!: string | null;

  @ApiProperty()
  canReviseAfterLock!: boolean;

  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty({ nullable: true })
  terminalText!: string | null;
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

  @ApiPropertyOptional({
    enum: DashboardHistoryVisibility,
    nullable: true,
    description:
      'LIMITED reduces match detail visibility; existing meetup access is governed by participant/session policy.',
  })
  latestMatchVisibility!: DashboardHistoryVisibility | null;

  @ApiPropertyOptional({ enum: DashboardHistoryLimitedReason, nullable: true })
  latestMatchLimitedReason!: DashboardHistoryLimitedReason | null;

  @ApiProperty({
    type: () => DashboardHistoryItemResponseDto,
    isArray: true,
  })
  recentMatchHistory!: DashboardHistoryItemResponseDto[];

  @ApiProperty({ type: () => DashboardTaskResponseDto, isArray: true })
  tasks!: DashboardTaskResponseDto[];

  @ApiProperty({
    type: () => DashboardMeetupSummaryResponseDto,
    nullable: true,
  })
  meetupSummary!: DashboardMeetupSummaryResponseDto | null;
}
