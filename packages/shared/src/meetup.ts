export const MEETUP_USER_TURN_STATUSES = [
  "NOT_STARTED",
  "WAITING_FOR_COUNTERPART",
  "NEEDS_YOUR_RESPONSE",
  "NONE",
] as const;

export type MeetupUserTurnStatus =
  (typeof MEETUP_USER_TURN_STATUSES)[number];

export const MEETUP_PROGRESS_STATUSES = [
  "NOT_STARTED",
  "NEGOTIATING",
  "LOCATION_CONFIRMED_TIME_PENDING",
  "TIME_CONFIRMED_LOCATION_PENDING",
  "AWAITING_FINAL_CONFIRMATION",
  "LOCKED",
  "CANCELED",
  "EXPIRED",
  "ARCHIVED",
] as const;

export type MeetupProgressStatus = (typeof MEETUP_PROGRESS_STATUSES)[number];

export const MEETUP_PROPOSAL_SCOPES = [
  "BOTH",
  "TIME_ONLY",
  "LOCATION_ONLY",
] as const;

export type MeetupProposalScope = (typeof MEETUP_PROPOSAL_SCOPES)[number];

export type MeetupLocationCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export const DEFAULT_MEETUP_TOLERANCE_MINUTES = 10;
export const MIN_MEETUP_PROPOSAL_LEAD_MINUTES = 30;
export const MIN_MEETUP_EXPIRATION_WEEKS = 1;
export const MAX_MEETUP_EXPIRATION_WEEKS = 4;
export const DEFAULT_MEETUP_EXPIRATION_WEEKS = 2;
export const MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES = 60;
export const MEETUP_TODO_PRIORITY = 11;
