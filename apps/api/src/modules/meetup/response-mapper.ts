import {
  type MeetupOptionKind,
  type MeetupProgressStatus,
  type MeetupUserTurnStatus,
} from './constants';
import {
  MeetupAvailableActionsResponseDto,
  MeetupCurrentPlanResponseDto,
  MeetupMessageResponseDto,
  MeetupOptionResponseDto,
  MeetupParticipantResponseDto,
  MeetupProposalResponseDto,
  MeetupSessionResponseDto,
} from './dto';
import type {
  MeetupOptionRecord,
  MeetupProposalRecord,
  MeetupSessionRecord,
} from './types';

export function deriveMeetupUserTurnStatus(
  session: MeetupSessionRecord | null,
  currentUserId: string,
): MeetupUserTurnStatus {
  if (!session) {
    return 'NOT_STARTED';
  }

  if (session.status !== 'ACTIVE') {
    return 'NONE';
  }

  if (session.finalConfirmRequiredByUserId === currentUserId) {
    return 'NEEDS_YOUR_RESPONSE';
  }

  if (session.finalConfirmRequiredByUserId) {
    return 'WAITING_FOR_COUNTERPART';
  }

  const currentParticipant = session.participants.find(
    (participant) => participant.userId === currentUserId,
  );

  if (currentParticipant?.turnState === 'REQUIRED') {
    return 'NEEDS_YOUR_RESPONSE';
  }

  if (currentParticipant?.turnState === 'WAITING') {
    return 'WAITING_FOR_COUNTERPART';
  }

  return 'NONE';
}

export function deriveMeetupProgressStatus(
  session: MeetupSessionRecord | null,
): MeetupProgressStatus {
  if (!session) {
    return 'NOT_STARTED';
  }

  if (session.status === 'CANCELED') {
    return 'CANCELED';
  }

  if (session.status === 'EXPIRED') {
    return 'EXPIRED';
  }

  if (session.status === 'ARCHIVED') {
    return 'ARCHIVED';
  }

  if (session.status === 'LOCKED') {
    return 'LOCKED';
  }

  if (session.finalConfirmRequiredByUserId) {
    return 'AWAITING_FINAL_CONFIRMATION';
  }

  if (session.confirmedLocationOptionId && !session.confirmedTimeOptionId) {
    return 'LOCATION_CONFIRMED_TIME_PENDING';
  }

  if (session.confirmedTimeOptionId && !session.confirmedLocationOptionId) {
    return 'TIME_CONFIRMED_LOCATION_PENDING';
  }

  return 'NEGOTIATING';
}

export function mapMeetupSessionResponse(
  session: MeetupSessionRecord,
  currentUserId: string,
  now: Date,
): MeetupSessionResponseDto {
  const counterpart =
    session.participants.find(
      (participant) => participant.userId !== currentUserId,
    ) ?? null;
  const currentPendingProposal = readCurrentPendingProposal(session);
  const confirmedTimeOption = session.confirmedTimeOption
    ? mapOption(session.confirmedTimeOption)
    : null;
  const confirmedLocationOption = session.confirmedLocationOption
    ? mapOption(session.confirmedLocationOption)
    : null;

  return {
    id: session.id,
    matchId: session.matchId,
    status: session.status,
    userTurnStatus: deriveMeetupUserTurnStatus(session, currentUserId),
    progressStatus: deriveMeetupProgressStatus(session),
    startedByUserId: session.startedByUserId,
    counterpartUserId: counterpart?.userId ?? '',
    counterpartDisplayName: counterpart?.user?.displayName ?? null,
    currentProposalId: session.currentProposalId,
    confirmedTimeOptionId: session.confirmedTimeOptionId,
    confirmedLocationOptionId: session.confirmedLocationOptionId,
    finalConfirmRequiredByUserId: session.finalConfirmRequiredByUserId,
    lockedAt: toIsoString(session.lockedAt),
    canceledAt: toIsoString(session.canceledAt),
    canceledByUserId: session.canceledByUserId,
    effectiveExpirationWeeks: session.effectiveExpirationWeeks,
    expiresAt: toIsoString(session.expiresAt),
    archiveEligibleAt: toIsoString(session.archiveEligibleAt),
    lastActiveAt: session.lastActiveAt.toISOString(),
    currentPlan: mapCurrentPlan(confirmedTimeOption, confirmedLocationOption),
    currentPendingProposal: currentPendingProposal
      ? mapProposal(currentPendingProposal)
      : null,
    participants: [...session.participants]
      .sort((left, right) => left.userId.localeCompare(right.userId))
      .map((participant): MeetupParticipantResponseDto => {
        return {
          userId: participant.userId,
          displayName: participant.user?.displayName ?? null,
          turnState: participant.turnState,
          revisionUsedAt: toIsoString(participant.revisionUsedAt),
          lastSeenAt: toIsoString(participant.lastSeenAt),
        };
      }),
    messages: [...session.messages]
      .sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )
      .map((message): MeetupMessageResponseDto => {
        return {
          id: message.id,
          actorUserId: message.actorUserId,
          type: message.type,
          notePreset: message.notePreset,
          noteText: message.noteText,
          createdAt: message.createdAt.toISOString(),
          proposal: message.proposal ? mapProposal(message.proposal) : null,
        };
      }),
    availableActions: mapAvailableActions({
      session,
      currentUserId,
      now,
      currentPendingProposal,
    }),
  };
}

function readCurrentPendingProposal(session: MeetupSessionRecord) {
  if (
    session.currentProposal &&
    session.currentProposalId === session.currentProposal.id &&
    session.currentProposal.status === 'PENDING'
  ) {
    return session.currentProposal;
  }

  return null;
}

function mapCurrentPlan(
  timeOption: MeetupOptionResponseDto | null,
  locationOption: MeetupOptionResponseDto | null,
): MeetupCurrentPlanResponseDto {
  return {
    timeOption,
    locationOption,
    startsAt: timeOption?.startsAt ?? null,
    endsAt: timeOption?.endsAt ?? null,
    toleranceMinutes: timeOption?.toleranceMinutes ?? null,
    locationCandidateId: locationOption?.locationCandidateId ?? null,
    placeName: locationOption?.placeName ?? null,
    latitude: locationOption?.latitude ?? null,
    longitude: locationOption?.longitude ?? null,
  };
}

function mapProposal(
  proposal: MeetupProposalRecord,
): MeetupProposalResponseDto {
  return {
    id: proposal.id,
    actorUserId: proposal.actorUserId,
    scope: proposal.scope,
    status: proposal.status,
    options: [...proposal.options]
      .sort((left, right) => {
        const kindSort = left.kind.localeCompare(right.kind);
        if (kindSort !== 0) {
          return kindSort;
        }
        return (
          (left.createdAt?.getTime() ?? 0) - (right.createdAt?.getTime() ?? 0)
        );
      })
      .map(mapOption),
  };
}

function mapOption(option: MeetupOptionRecord): MeetupOptionResponseDto {
  return {
    id: option.id,
    kind: option.kind,
    status: option.status,
    startsAt: toIsoString(option.startsAt),
    endsAt: toIsoString(option.endsAt),
    toleranceMinutes:
      option.kind === 'TIME' ? (option.toleranceMinutes ?? null) : null,
    locationCandidateId: option.locationCandidateId,
    placeName: option.placeName,
    latitude: option.latitude,
    longitude: option.longitude,
  };
}

function mapAvailableActions(input: {
  session: MeetupSessionRecord;
  currentUserId: string;
  now: Date;
  currentPendingProposal: MeetupProposalRecord | null;
}): MeetupAvailableActionsResponseDto {
  const { session, currentUserId, now, currentPendingProposal } = input;
  const currentParticipant = session.participants.find(
    (participant) => participant.userId === currentUserId,
  );
  const currentTurnState = currentParticipant?.turnState ?? 'NONE';
  const finalConfirmTimeStartsAt =
    session.confirmedTimeOption?.startsAt ?? null;
  const lockedStarted =
    finalConfirmTimeStartsAt != null && finalConfirmTimeStartsAt <= now;
  const reopenedGuardStarted =
    session.reopenedFromLockedStartsAt != null &&
    session.reopenedFromLockedStartsAt <= now;
  const activeExpired =
    session.status === 'ACTIVE' &&
    session.expiresAt != null &&
    session.expiresAt <= now;
  const terminalReason = readTerminalActionReason(session.status);

  const canPropose =
    session.status === 'ACTIVE' &&
    !activeExpired &&
    !reopenedGuardStarted &&
    (currentTurnState === 'REQUIRED' ||
      session.finalConfirmRequiredByUserId === currentUserId);
  const acceptKinds = currentPendingProposal
    ? readPendingOptionKinds(currentPendingProposal)
    : [];
  const canAccept =
    session.status === 'ACTIVE' &&
    !activeExpired &&
    !reopenedGuardStarted &&
    session.finalConfirmRequiredByUserId == null &&
    currentPendingProposal != null &&
    currentPendingProposal.actorUserId !== currentUserId &&
    currentTurnState === 'REQUIRED';
  const canReject = canAccept;
  const canFinalConfirm =
    session.status === 'ACTIVE' &&
    !activeExpired &&
    !reopenedGuardStarted &&
    session.confirmedTimeOptionId != null &&
    session.confirmedLocationOptionId != null &&
    session.finalConfirmRequiredByUserId === currentUserId &&
    finalConfirmTimeStartsAt != null &&
    finalConfirmTimeStartsAt > now;
  const canRevise =
    session.status === 'LOCKED' &&
    !lockedStarted &&
    currentParticipant?.revisionUsedAt == null;
  const lockedCancelStarted = session.status === 'LOCKED' && lockedStarted;
  const canCancel =
    session.status === 'ACTIVE'
      ? !activeExpired && !reopenedGuardStarted
      : session.status === 'LOCKED'
        ? !lockedCancelStarted
        : false;

  return {
    propose: {
      enabled: canPropose,
      reason: canPropose
        ? null
        : (terminalReason ??
          (activeExpired
            ? 'SESSION_EXPIRED'
            : reopenedGuardStarted
              ? 'REOPENED_LOCKED_TIME_STARTED'
              : 'TURN_NOT_REQUIRED')),
    },
    accept: {
      enabled: canAccept,
      reason: canAccept
        ? null
        : (terminalReason ??
          (activeExpired
            ? 'SESSION_EXPIRED'
            : reopenedGuardStarted
              ? 'REOPENED_LOCKED_TIME_STARTED'
              : currentPendingProposal?.actorUserId === currentUserId
                ? 'CANNOT_ACCEPT_OWN_PROPOSAL'
                : 'NO_ACCEPTABLE_PENDING_PROPOSAL')),
      requiredOptionKinds: acceptKinds,
    },
    reject: {
      enabled: canReject,
      reason: canReject
        ? null
        : (terminalReason ??
          (activeExpired
            ? 'SESSION_EXPIRED'
            : reopenedGuardStarted
              ? 'REOPENED_LOCKED_TIME_STARTED'
              : 'NO_REJECTABLE_PENDING_PROPOSAL')),
    },
    finalConfirm: {
      enabled: canFinalConfirm,
      reason: canFinalConfirm
        ? null
        : (terminalReason ??
          (lockedStarted
            ? 'CONFIRMED_TIME_ALREADY_STARTED'
            : 'FINAL_CONFIRM_NOT_REQUIRED')),
    },
    reviseAfterLock: {
      enabled: canRevise,
      reason: canRevise
        ? null
        : (terminalReason ??
          (lockedStarted
            ? 'CONFIRMED_TIME_ALREADY_STARTED'
            : currentParticipant?.revisionUsedAt
              ? 'REVISION_ALREADY_USED'
              : 'SESSION_NOT_LOCKED')),
    },
    cancel: {
      enabled: canCancel,
      reason: canCancel
        ? null
        : (terminalReason ??
          (activeExpired
            ? 'SESSION_EXPIRED'
            : reopenedGuardStarted
              ? 'REOPENED_LOCKED_TIME_STARTED'
              : lockedCancelStarted
                ? 'CONFIRMED_TIME_ALREADY_STARTED'
                : 'SESSION_NOT_CANCELABLE')),
    },
  };
}

function readPendingOptionKinds(
  proposal: MeetupProposalRecord,
): MeetupOptionKind[] {
  return Array.from(
    new Set(
      proposal.options
        .filter((option) => option.status === 'PENDING')
        .map((option) => option.kind),
    ),
  ).sort();
}

function readTerminalActionReason(status: MeetupSessionRecord['status']) {
  switch (status) {
    case 'CANCELED':
      return 'SESSION_CANCELED';
    case 'EXPIRED':
      return 'SESSION_EXPIRED';
    case 'ARCHIVED':
      return 'SESSION_ARCHIVED';
    default:
      return null;
  }
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}
