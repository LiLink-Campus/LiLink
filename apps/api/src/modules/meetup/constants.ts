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

export const MEETUP_FEEDBACK_SCORE_MIN = 1;
export const MEETUP_FEEDBACK_SCORE_MAX = 5;
export const MEETUP_FEEDBACK_NOTE_MAX_LENGTH = 1000;
export const MEETUP_FEEDBACK_POSITIVE_TAG_MAX_COUNT = 5;
export const MEETUP_FEEDBACK_ISSUE_TAG_MAX_COUNT = 5;

export const MEETUP_FEEDBACK_POSITIVE_TAGS = [
  'EASY_TO_TALK',
  'GOOD_LISTENER',
  'RESPECTFUL',
  'ON_TIME',
  'CLEAR_PLAN',
  'COMFORTABLE_PACE',
] as const;

export const MEETUP_FEEDBACK_ISSUE_TAGS = [
  'LOW_EFFORT',
  'INTERRUPTED_OFTEN',
  'HARD_TO_COMMUNICATE',
  'LATE_OR_NO_SHOW',
  'BOUNDARY_PRESSURE',
  'HARASSMENT_OR_SEXUAL_COMMENTS',
  'DISCRIMINATION',
  'AGGRESSIVE_OR_THREATENING',
  'MONEY_OR_SCAM',
  'IDENTITY_MISMATCH',
  'OTHER',
] as const;

export const MEETUP_SAFETY_BOUNDARY_LEVELS = [
  'NO_CONCERN',
  'MINOR_CONCERN',
  'SERIOUS_CONCERN',
] as const;

export type MeetupFeedbackPositiveTag =
  (typeof MEETUP_FEEDBACK_POSITIVE_TAGS)[number];

export type MeetupFeedbackIssueTag =
  (typeof MEETUP_FEEDBACK_ISSUE_TAGS)[number];

export type MeetupSafetyBoundaryLevel =
  (typeof MEETUP_SAFETY_BOUNDARY_LEVELS)[number];
