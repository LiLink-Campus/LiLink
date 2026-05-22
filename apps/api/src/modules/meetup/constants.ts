export {
  DEFAULT_MEETUP_EXPIRATION_WEEKS,
  DEFAULT_MEETUP_TOLERANCE_MINUTES,
  MAX_MEETUP_EXPIRATION_WEEKS,
  MAX_MEETUP_PLACE_NAME_LENGTH,
  MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES,
  MEETUP_PROPOSAL_SCOPES,
  MIN_MEETUP_EXPIRATION_WEEKS,
  MIN_MEETUP_PROPOSAL_LEAD_MINUTES,
  type MeetupProgressStatus,
  type MeetupProposalScope,
  type MeetupUserTurnStatus,
} from '@lilink/shared';

export type MeetupSessionStatus =
  | 'ACTIVE'
  | 'LOCKED'
  | 'CANCELED'
  | 'EXPIRED'
  | 'ARCHIVED';

export type MeetupParticipantTurnState = 'NONE' | 'REQUIRED' | 'WAITING';

export type MeetupMessageType =
  | 'PROPOSE'
  | 'ACCEPT'
  | 'REJECT'
  | 'FINAL_CONFIRM'
  | 'REVISE_AFTER_LOCK'
  | 'CANCEL';

export type MeetupCancelReason = 'USER_CANCELED';

export type MeetupProposalStatus =
  | 'PENDING'
  | 'PARTIALLY_ACCEPTED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'SUPERSEDED';

export type MeetupOptionKind = 'TIME' | 'LOCATION';

export type MeetupOptionStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'DISABLED';
