import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTACT_CHANNEL_TYPES,
  WEEKLY_INTENTS,
  DashboardHistoryResult,
  DashboardHistoryVisibility,
  DashboardHistoryLimitedReason,
  type ContactChannelType,
  type WeeklyIntent,
  type DashboardPublicContact,
  type DashboardMatchParticipant,
  type DashboardMatch,
  type DashboardHistoryItem,
  type DashboardCurrentCycle,
  type DashboardLastRevealedRound,
  type CouponAgendaReadState,
  type DashboardPayload,
} from '@lilink/shared';

export class DashboardPublicContactResponseDto implements DashboardPublicContact {
  @ApiProperty({ enum: CONTACT_CHANNEL_TYPES as unknown as string[] })
  type!: ContactChannelType;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: string;
}

export class DashboardMatchParticipantResponseDto implements DashboardMatchParticipant {
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

  @ApiProperty({ nullable: true })
  gender!: string | null;

  @ApiProperty({ type: String, isArray: true })
  partnerGenders!: string[];

  @ApiProperty({ enum: ['FRIEND', 'DATE', 'BOTH'], nullable: true })
  weeklyIntent!: WeeklyIntent | null;
}

export class DashboardMatchResponseDto implements DashboardMatch {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ nullable: true, format: 'date-time' })
  introducedAt!: string | null;

  @ApiPropertyOptional({
    enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
    nullable: true,
  })
  reportStatus!: DashboardMatch['reportStatus'];

  @ApiProperty({
    type: () => DashboardMatchParticipantResponseDto,
    isArray: true,
  })
  participants!: DashboardMatchParticipantResponseDto[];
}

export class DashboardHistoryItemResponseDto implements DashboardHistoryItem {
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

export class DashboardCurrentCycleResponseDto implements DashboardCurrentCycle {
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
      'Weekly matching intent (FRIEND/DATE/BOTH), explicitly confirmed for each cycle. Null means this participation lacks a usable intent and will be excluded from matching.',
  })
  intent!: WeeklyIntent | null;
}

export class DashboardLastRevealedRoundResponseDto implements DashboardLastRevealedRound {
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

export class DashboardCouponAgendaResponseDto implements CouponAgendaReadState {
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

export class DashboardResponseDto implements DashboardPayload {
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
    description: 'LIMITED hides participant details for unavailable matches.',
  })
  latestMatchVisibility!: DashboardHistoryVisibility | null;

  @ApiPropertyOptional({ enum: DashboardHistoryLimitedReason, nullable: true })
  latestMatchLimitedReason!: DashboardHistoryLimitedReason | null;

  @ApiProperty({
    type: () => DashboardHistoryItemResponseDto,
    isArray: true,
  })
  recentMatchHistory!: DashboardHistoryItemResponseDto[];

  @ApiProperty({ type: () => DashboardCouponAgendaResponseDto })
  couponAgenda!: DashboardCouponAgendaResponseDto;
}
