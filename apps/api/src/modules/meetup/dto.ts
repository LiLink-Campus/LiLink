import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MEETUP_PLACE_NAME_LENGTH,
  MEETUP_PROPOSAL_SCOPES,
  type MeetupMessageType,
  type MeetupOptionKind,
  type MeetupOptionStatus,
  type MeetupParticipantTurnState,
  type MeetupProgressStatus,
  type MeetupProposalScope,
  type MeetupProposalStatus,
  type MeetupSessionStatus,
  type MeetupUserTurnStatus,
} from './constants';

export class CreateMeetupProposalDto {
  @IsIn(MEETUP_PROPOSAL_SCOPES)
  scope!: MeetupProposalScope;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => MeetupTimeOptionInputDto)
  timeOptions?: MeetupTimeOptionInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => MeetupLocationOptionInputDto)
  locationOptions?: MeetupLocationOptionInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class StartMeetupSessionDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMeetupProposalDto)
  proposal!: CreateMeetupProposalDto;
}

export class MeetupTimeOptionInputDto {
  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(60)
  toleranceMinutes?: number;
}

export class MeetupLocationOptionInputDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MEETUP_PLACE_NAME_LENGTH)
  locationCandidateId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_MEETUP_PLACE_NAME_LENGTH)
  placeName?: string;
}

export class AcceptMeetupOptionsDto {
  @IsOptional()
  @IsString()
  timeOptionId?: string;

  @IsOptional()
  @IsString()
  locationOptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class RejectMeetupProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class ReviseMeetupSessionDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMeetupProposalDto)
  proposal!: CreateMeetupProposalDto;
}

export class CancelMeetupSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class MeetupSessionResponseDto {
  id!: string;
  matchId!: string;
  status!: MeetupSessionStatus;
  userTurnStatus!: MeetupUserTurnStatus;
  progressStatus!: MeetupProgressStatus;
  startedByUserId!: string;
  counterpartUserId!: string;
  counterpartDisplayName!: string | null;
  currentProposalId!: string | null;
  confirmedTimeOptionId!: string | null;
  confirmedLocationOptionId!: string | null;
  finalConfirmRequiredByUserId!: string | null;
  lockedAt!: string | null;
  canceledAt!: string | null;
  canceledByUserId!: string | null;
  effectiveExpirationWeeks!: number | null;
  expiresAt!: string | null;
  archiveEligibleAt!: string | null;
  lastActiveAt!: string;
  currentPlan!: MeetupCurrentPlanResponseDto;
  currentPendingProposal!: MeetupProposalResponseDto | null;
  participants!: MeetupParticipantResponseDto[];
  messages!: MeetupMessageResponseDto[];
  availableActions!: MeetupAvailableActionsResponseDto;
}

export class MeetupCurrentPlanResponseDto {
  timeOption!: MeetupOptionResponseDto | null;
  locationOption!: MeetupOptionResponseDto | null;
  startsAt!: string | null;
  endsAt!: string | null;
  toleranceMinutes!: number | null;
  locationCandidateId!: string | null;
  placeName!: string | null;
  latitude!: number | null;
  longitude!: number | null;
}

export class MeetupParticipantResponseDto {
  userId!: string;
  displayName!: string | null;
  turnState!: MeetupParticipantTurnState;
  revisionUsedAt!: string | null;
  lastSeenAt!: string | null;
}

export class MeetupMessageResponseDto {
  id!: string;
  actorUserId!: string;
  type!: MeetupMessageType;
  notePreset!: string | null;
  noteText!: string | null;
  createdAt!: string;
  proposal!: MeetupProposalResponseDto | null;
}

export class MeetupProposalResponseDto {
  id!: string;
  actorUserId!: string;
  scope!: MeetupProposalScope;
  status!: MeetupProposalStatus;
  options!: MeetupOptionResponseDto[];
}

export class MeetupOptionResponseDto {
  id!: string;
  kind!: MeetupOptionKind;
  status!: MeetupOptionStatus;
  startsAt!: string | null;
  endsAt!: string | null;
  toleranceMinutes!: number | null;
  locationCandidateId!: string | null;
  placeName!: string | null;
  latitude!: number | null;
  longitude!: number | null;
}

export class MeetupLocationCandidateResponseDto {
  id!: string;
  name!: string;
  latitude!: number;
  longitude!: number;
}

export class MeetupAvailableActionsResponseDto {
  propose!: MeetupActionAvailabilityDto;
  accept!: MeetupActionAvailabilityDto & {
    requiredOptionKinds: MeetupOptionKind[];
  };
  reject!: MeetupActionAvailabilityDto;
  finalConfirm!: MeetupActionAvailabilityDto;
  reviseAfterLock!: MeetupActionAvailabilityDto;
  cancel!: MeetupActionAvailabilityDto;
}

export class MeetupActionAvailabilityDto {
  enabled!: boolean;
  reason!: string | null;
}
