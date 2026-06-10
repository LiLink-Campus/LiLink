import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
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
  HARD_MATCH_GENDERS,
  MATCH_ESTIMATE_BANDS,
  MEETUP_PROGRESS_STATUSES,
  MEETUP_TODO_PRIORITY,
  MEETUP_USER_TURN_STATUSES,
  SUPPORTED_LOCALES,
  WEEKLY_INTENTS,
  type MatchEstimateBand,
  type MeetupProgressStatus,
  type MeetupUserTurnStatus,
  type ContactChannelType,
  type EditableContactChannelType,
  type SupportedLocale,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '../../common/validation/display-name';
import {
  CONTACT_METHOD_VALUE_MAX_LENGTH,
  PROFILE_ARRAY_ITEM_MAX_LENGTH,
  PROFILE_ARRAY_MAX_ITEMS,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_FULL_NAME_MAX_LENGTH,
  PROFILE_HEADLINE_MAX_LENGTH,
  PROFILE_SHORT_TEXT_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS,
  REPORT_DETAILS_MAX_LENGTH,
  MATCH_FEEDBACK_COMMENT_MAX_LENGTH,
} from '../../common/validation/input-limits';

export class UpdateProfileDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_FULL_NAME_MAX_LENGTH)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_HEADLINE_MAX_LENGTH)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_BIO_MAX_LENGTH)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  schoolYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  programName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  pronouns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  hometown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
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
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  interestedIn?: string[];
}

export class SaveQuestionnaireDto {
  @IsObject()
  answers!: Record<string, unknown>;

  @IsObject()
  hardMatchForm!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;
}

export class AcknowledgeQuestionnaireItemsDto {
  @IsString()
  versionId!: string;

  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH, { each: true })
  keys!: string[];
}

const MATCH_ESTIMATE_MAX_SCHOOLS = 100;
const MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH = 64;

export class MatchEstimateSchoolGenderDto {
  @IsString()
  @MaxLength(MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH)
  schoolId!: string;

  @IsArray()
  @ArrayMaxSize(HARD_MATCH_GENDERS.length)
  @ArrayUnique()
  @IsIn(HARD_MATCH_GENDERS, { each: true })
  genders!: string[];
}

export class MatchEstimateRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_ESTIMATE_MAX_SCHOOLS)
  @IsString({ each: true })
  @MaxLength(MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH, { each: true })
  excludedPartnerSchools?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_ESTIMATE_MAX_SCHOOLS)
  @ValidateNested({ each: true })
  @Type(() => MatchEstimateSchoolGenderDto)
  excludedPartnerSchoolGenders?: MatchEstimateSchoolGenderDto[];
}

export class MatchEstimateResponseDto {
  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional({ enum: MATCH_ESTIMATE_BANDS as unknown as string[] })
  band?: MatchEstimateBand;

  @ApiPropertyOptional()
  lowConfidence?: boolean;
}

export class ToggleParticipationDto {
  @IsBoolean()
  optIn!: boolean;

  // Required when opting in; ignored otherwise. Strict contract: opting in
  // without an intent must fail the request rather than silently default.
  @ValidateIf((dto: ToggleParticipationDto) => dto.optIn === true)
  @IsIn(WEEKLY_INTENTS)
  intent?: WeeklyIntent;
}

export class UpdateLocaleDto {
  @IsIn(SUPPORTED_LOCALES)
  locale!: SupportedLocale;
}

export class ContactMethodDto {
  @IsIn(EDITABLE_CONTACT_CHANNEL_TYPES)
  type!: EditableContactChannelType;

  @IsString()
  @MaxLength(CONTACT_METHOD_VALUE_MAX_LENGTH)
  value!: string;
}

export class UpdateContactPreferencesDto {
  @IsIn(CONTACT_CHANNEL_TYPES)
  preferredContactChannel!: ContactChannelType;

  @IsArray()
  @ArrayMaxSize(EDITABLE_CONTACT_CHANNEL_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => ContactMethodDto)
  methods!: ContactMethodDto[];
}

export class DashboardPublicContactResponseDto {
  @ApiProperty({ enum: CONTACT_CHANNEL_TYPES as unknown as string[] })
  type!: ContactChannelType;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string;
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
  @MaxLength(REPORT_DETAILS_MAX_LENGTH)
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

  @ApiProperty({ nullable: true })
  gender!: string | null;

  @ApiProperty({ type: String, isArray: true })
  partnerGenders!: string[];

  @ApiProperty({ enum: ['FRIEND', 'DATE', 'BOTH'], nullable: true })
  weeklyIntent!: WeeklyIntent | null;
}

export class MatchFeedbackResponseDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  rating!: number;

  @ApiProperty({ nullable: true })
  comment!: string | null;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class DashboardMeetupFeedbackResponseDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  personalFitScore!: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  interactionQualityScore!: number;

  @ApiProperty({
    enum: ['NO_CONCERN', 'MINOR_CONCERN', 'SERIOUS_CONCERN'],
  })
  safetyBoundaryLevel!: string;

  @ApiProperty({ type: String, isArray: true })
  positiveTags!: string[];

  @ApiProperty({ type: String, isArray: true })
  issueTags!: string[];

  @ApiProperty({ nullable: true })
  note!: string | null;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;
}

export class SubmitMatchFeedbackDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(MATCH_FEEDBACK_COMMENT_MAX_LENGTH)
  comment?: string | null;
}

export class DashboardMatchResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  score!: number;

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

  @ApiProperty({ type: () => MatchFeedbackResponseDto, nullable: true })
  currentUserFeedback!: MatchFeedbackResponseDto | null;
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

  @ApiProperty({
    type: () => DashboardMeetupSummaryResponseDto,
    nullable: true,
  })
  meetupSummary!: DashboardMeetupSummaryResponseDto | null;
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

  @ApiProperty({
    type: () => DashboardMeetupFeedbackResponseDto,
    nullable: true,
  })
  currentUserFeedback!: DashboardMeetupFeedbackResponseDto | null;

  @ApiProperty()
  canSubmitFeedback!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  feedbackEligibleAt!: string | null;
}

export class DashboardCouponAgendaResponseDto {
  @ApiProperty()
  target!: string;

  @ApiProperty()
  version!: string;

  @ApiProperty()
  availableCount!: number;

  @ApiProperty()
  unreadAvailableCount!: number;

  @ApiProperty()
  read!: boolean;

  @ApiProperty({ nullable: true, format: 'date-time' })
  readAt!: string | null;

  @ApiProperty({ example: '/dashboard/coupons' })
  href!: '/dashboard/coupons';
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

  @ApiProperty({ type: () => DashboardCouponAgendaResponseDto })
  couponAgenda!: DashboardCouponAgendaResponseDto;
}
