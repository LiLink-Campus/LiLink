export {
  DEFAULT_MEETUP_EXPIRATION_WEEKS,
  DEFAULT_MEETUP_TOLERANCE_MINUTES,
  MAX_MEETUP_EXPIRATION_WEEKS,
  MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES,
  MEETUP_PROGRESS_STATUSES,
  MEETUP_PROPOSAL_SCOPES,
  MEETUP_USER_TURN_STATUSES,
  MIN_MEETUP_EXPIRATION_WEEKS,
  MIN_MEETUP_PROPOSAL_LEAD_MINUTES,
  type MeetupProgressStatus,
  type MeetupProposalScope,
  type MeetupUserTurnStatus,
} from '@lilink/shared';

export const MEETUP_SESSION_STATUSES = [
  'ACTIVE',
  'LOCKED',
  'CANCELED',
  'EXPIRED',
  'ARCHIVED',
] as const;

export type MeetupSessionStatus = (typeof MEETUP_SESSION_STATUSES)[number];

export const MEETUP_PARTICIPANT_TURN_STATES = [
  'NONE',
  'REQUIRED',
  'WAITING',
] as const;

export type MeetupParticipantTurnState =
  (typeof MEETUP_PARTICIPANT_TURN_STATES)[number];

export const MEETUP_MESSAGE_TYPES = [
  'PROPOSE',
  'ACCEPT',
  'REJECT',
  'FINAL_CONFIRM',
  'REVISE_AFTER_LOCK',
  'CANCEL',
] as const;

export type MeetupMessageType = (typeof MEETUP_MESSAGE_TYPES)[number];

export const MEETUP_CANCEL_REASONS = ['USER_CANCELED'] as const;

export type MeetupCancelReason = (typeof MEETUP_CANCEL_REASONS)[number];

export const MEETUP_PROPOSAL_STATUSES = [
  'PENDING',
  'PARTIALLY_ACCEPTED',
  'CONFIRMED',
  'REJECTED',
  'SUPERSEDED',
] as const;

export type MeetupProposalStatus = (typeof MEETUP_PROPOSAL_STATUSES)[number];

export const MEETUP_OPTION_KINDS = ['TIME', 'LOCATION'] as const;

export type MeetupOptionKind = (typeof MEETUP_OPTION_KINDS)[number];

export const MEETUP_OPTION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'DISABLED',
] as const;

export type MeetupOptionStatus = (typeof MEETUP_OPTION_STATUSES)[number];
