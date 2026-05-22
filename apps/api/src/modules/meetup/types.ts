import type {
  MeetupCancelReason,
  MeetupMessageType,
  MeetupOptionKind,
  MeetupOptionStatus,
  MeetupParticipantTurnState,
  MeetupProposalScope,
  MeetupProposalStatus,
  MeetupSessionStatus,
} from './constants';

type DelegateMethod<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
) => Promise<TResult>;

type MeetupDelegate = {
  findUnique: DelegateMethod;
  findFirst: DelegateMethod;
  findMany: DelegateMethod;
  create: DelegateMethod;
  createMany: DelegateMethod;
  createManyAndReturn: DelegateMethod;
  update: DelegateMethod;
  updateMany: DelegateMethod;
  upsert: DelegateMethod;
  count: DelegateMethod;
};

export type MeetupTransactionClient = {
  auditLog: MeetupDelegate;
  match: MeetupDelegate;
  matchParticipant: MeetupDelegate;
  meetupMessage: MeetupDelegate;
  meetupOption: MeetupDelegate;
  meetupParticipant: MeetupDelegate;
  meetupProposal: MeetupDelegate;
  meetupSession: MeetupDelegate;
  outboundEmail: MeetupDelegate;
  user: MeetupDelegate;
};

export type MeetupPrismaClient = MeetupTransactionClient & {
  $transaction<T>(
    callback: (tx: MeetupTransactionClient) => Promise<T>,
  ): Promise<T>;
};

export type CountResult = {
  count: number;
};

type MeetupUserRecord = {
  id: string;
  displayName: string | null;
  meetupExpirationWeeks?: number | null;
};

type MatchParticipantRecord = {
  id: string;
  matchId: string;
  userId: string;
  contactRequestedAt?: Date | null;
  user?: MeetupUserRecord | null;
};

export type MeetupMatchRecord = {
  id: string;
  introducedAt: Date | null;
  revealedAt?: Date | null;
  participants: MatchParticipantRecord[];
};

/**
 * @internal Exported for meetup service tests.
 */
export type MeetupParticipantRecord = {
  id: string;
  sessionId: string;
  userId: string;
  matchParticipantId: string;
  turnState: MeetupParticipantTurnState;
  responseRequiredAt: Date | null;
  responseRequiredMessageId: string | null;
  revisionUsedAt: Date | null;
  lastSeenAt: Date | null;
  user?: MeetupUserRecord | null;
};

export type MeetupOptionRecord = {
  id: string;
  proposalId: string;
  sessionId: string;
  kind: MeetupOptionKind;
  status: MeetupOptionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  toleranceMinutes: number;
  locationCandidateId: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt?: Date;
};

export type MeetupProposalRecord = {
  id: string;
  sessionId: string;
  messageId: string;
  actorUserId: string;
  scope: MeetupProposalScope;
  status: MeetupProposalStatus;
  createdAt: Date;
  updatedAt?: Date;
  options: MeetupOptionRecord[];
};

type MeetupMessageRecord = {
  id: string;
  sessionId: string;
  actorUserId: string;
  type: MeetupMessageType;
  notePreset: string | null;
  noteText: string | null;
  createdAt: Date;
  proposal: MeetupProposalRecord | null;
};

export type MeetupSessionRecord = {
  id: string;
  matchId: string;
  status: MeetupSessionStatus;
  currentProposalId: string | null;
  currentProposal: MeetupProposalRecord | null;
  confirmedTimeOptionId: string | null;
  confirmedTimeOption: MeetupOptionRecord | null;
  confirmedLocationOptionId: string | null;
  confirmedLocationOption: MeetupOptionRecord | null;
  finalConfirmRequiredByUserId: string | null;
  startedByUserId: string;
  canceledByUserId: string | null;
  cancelReason: MeetupCancelReason | null;
  cancelNote: string | null;
  reopenedFromLockedAt: Date | null;
  reopenedFromLockedStartsAt: Date | null;
  lockVersion: number;
  lastActiveAt: Date;
  effectiveExpirationWeeks: number | null;
  expiresAt: Date | null;
  archiveEligibleAt: Date | null;
  lockedAt: Date | null;
  canceledAt: Date | null;
  expiredAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
  participants: MeetupParticipantRecord[];
  messages: MeetupMessageRecord[];
};
