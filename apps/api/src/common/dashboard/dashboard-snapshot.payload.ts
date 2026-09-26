import {
  Prisma,
  type ParticipationStatus,
  type ReportStatus,
} from '../prisma/client';
import {
  readQuestionnaireOneLiner,
  CONTACT_CHANNEL_LABELS,
  HARD_MATCH_KEYS,
  contactChannelLabel,
  type ContactChannelType,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  DashboardHistoryVisibility,
  type DashboardMatchResponseDto,
} from '../../modules/account/dto';
import {
  type SnapshotCycle,
  type SnapshotParticipation,
  type SnapshotMatch,
  type SnapshotBlock,
  type SnapshotPayload,
} from './dashboard-snapshot.types';

function createPairKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join('::');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildIntroducedContact(input: {
  introducedContactType: ContactChannelType | null;
  introducedContactValue: string | null;
  fallbackEmail: string;
}) {
  if (input.introducedContactType && input.introducedContactValue) {
    return {
      type: input.introducedContactType,
      label: CONTACT_CHANNEL_LABELS[input.introducedContactType],
      value: input.introducedContactValue,
    };
  }

  return {
    type: 'EMAIL' as const,
    label: contactChannelLabel('EMAIL'),
    value: input.fallbackEmail,
  };
}

export function buildSnapshotsForCycle(input: {
  cycle: Pick<SnapshotCycle, 'id' | 'codename' | 'revealAt'>;
  participations: SnapshotParticipation[];
  matches: SnapshotMatch[];
  blocks: SnapshotBlock[];
}) {
  const blockedPairKeys = buildBlockedPairKeySet(input.blocks);
  const intentByUserId = buildIntentByUserId(input.participations);
  const matchByUserId = new Map<string, SnapshotMatch>();

  for (const match of input.matches) {
    for (const participant of match.participants) {
      matchByUserId.set(participant.userId, match);
    }
  }

  return input.participations.map((participation) =>
    buildSnapshotPayload({
      userId: participation.userId,
      cycle: input.cycle,
      participationStatus: participation.status,
      match: matchByUserId.get(participation.userId) ?? null,
      blockedPairKeys,
      intentByUserId,
    }),
  );
}

export function buildBlockedPairKeySet(blocks: SnapshotBlock[]) {
  return new Set(
    blocks.map((block) => createPairKey(block.blockerId, block.blockedId)),
  );
}

export function buildIntentByUserId(
  participations: Array<{ userId: string; intent: WeeklyIntent | null }>,
) {
  return new Map<string, WeeklyIntent | null>(
    participations.map((participation) => [
      participation.userId,
      participation.intent,
    ]),
  );
}

export function buildSnapshotPayload(input: {
  userId: string;
  cycle: {
    id: string;
    codename: string;
    revealAt: Date;
  };
  participationStatus: ParticipationStatus;
  match: SnapshotMatch | null;
  blockedPairKeys: Set<string>;
  intentByUserId: Map<string, WeeklyIntent | null>;
}): SnapshotPayload {
  if (!input.match?.introducedAt) {
    return {
      userId: input.userId,
      cycleId: input.cycle.id,
      cycleRevealAt: input.cycle.revealAt,
      cycleCodename: input.cycle.codename,
      participationStatus: input.participationStatus,
      result:
        input.participationStatus === 'OPTED_IN'
          ? 'UNMATCHED'
          : 'NOT_PARTICIPATED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      matchId: null,
      matchPayload: Prisma.DbNull,
    };
  }

  const counterpart = findCounterpartParticipant(
    input.match.participants,
    input.userId,
  );
  const reportStatus = readLatestReportStatus(
    input.match.reports,
    input.userId,
  );
  const limitedReason =
    !counterpart || counterpart.user.deactivatedAt
      ? 'ACCOUNT_DEACTIVATED'
      : reportStatus
        ? 'REPORTED'
        : counterpart &&
            input.blockedPairKeys.has(
              createPairKey(input.userId, counterpart.userId),
            )
          ? 'BLOCKED'
          : null;
  const visibility =
    limitedReason == null
      ? DashboardHistoryVisibility.VISIBLE
      : DashboardHistoryVisibility.LIMITED;
  const matchPayload = buildMatchPayload({
    match: input.match,
    hideSensitiveFields: visibility === DashboardHistoryVisibility.LIMITED,
    reportStatus,
    intentByUserId: input.intentByUserId,
  });

  return {
    userId: input.userId,
    cycleId: input.cycle.id,
    cycleRevealAt: input.cycle.revealAt,
    cycleCodename: input.cycle.codename,
    participationStatus: input.participationStatus,
    result: 'MATCHED',
    visibility,
    limitedReason,
    matchId: input.match.id,
    matchPayload: matchPayload as unknown as Prisma.InputJsonValue,
  };
}

export function buildMatchPayload(input: {
  match: SnapshotMatch;
  hideSensitiveFields: boolean;
  reportStatus: ReportStatus | null;
  intentByUserId: Map<string, WeeklyIntent | null>;
}): DashboardMatchResponseDto {
  return {
    id: input.match.id,
    score: input.match.score,
    introducedAt: toIsoString(input.match.introducedAt),
    reportStatus: input.reportStatus,

    participants: input.hideSensitiveFields
      ? []
      : input.match.participants.map((participant) => {
          const contact = input.match.introducedAt
            ? buildIntroducedContact({
                introducedContactType: participant.introducedContactType,
                introducedContactValue: participant.introducedContactValue,
                fallbackEmail: participant.user.email,
              })
            : null;

          return {
            userId: participant.userId,
            displayName: participant.user.displayName,
            ...readParticipantProfile(participant),
            email: contact?.type === 'EMAIL' ? contact.value : null,
            contact,
            schoolName: participant.user.school?.name ?? null,
            weeklyIntent: input.intentByUserId.get(participant.userId) ?? null,
          };
        }),
  };
}

export function readParticipantProfile(
  participant: SnapshotMatch['participants'][number],
) {
  const snapshot = participant.profileSnapshot;
  if (isRecord(snapshot)) {
    return {
      introLine:
        typeof snapshot.introLine === 'string' ? snapshot.introLine : null,
      gender: typeof snapshot.gender === 'string' ? snapshot.gender : null,
      partnerGenders: Array.isArray(snapshot.partnerGenders)
        ? snapshot.partnerGenders.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
    };
  }
  return {
    introLine: displayIntroLine(
      participant.user.questionnaireResponse?.answers,
      participant.user.profile?.headline,
    ),
    gender: readHardGender(participant.user.questionnaireResponse?.answers),
    partnerGenders: readHardPartnerGenders(
      participant.user.questionnaireResponse?.answers,
    ),
  };
}

export function findCounterpartParticipant(
  participants: SnapshotMatch['participants'],
  userId: string,
) {
  return (
    participants.find((participant) => participant.userId !== userId) ?? null
  );
}

export function readLatestReportStatus(
  reports: SnapshotMatch['reports'],
  userId: string,
): ReportStatus | null {
  return reports.find((report) => report.reporterId === userId)?.status ?? null;
}

export function displayIntroLine(
  answers: Prisma.JsonValue | null | undefined,
  profileHeadline: string | null | undefined,
) {
  const fromQuestionnaire = readQuestionnaireOneLiner(answers);
  if (fromQuestionnaire) {
    return fromQuestionnaire;
  }

  const trimmedHeadline = profileHeadline?.trim();
  return trimmedHeadline ? trimmedHeadline : null;
}

export function readHardGender(
  answers: Prisma.JsonValue | null | undefined,
): string | null {
  if (!isRecord(answers)) {
    return null;
  }
  const value = answers[HARD_MATCH_KEYS.gender];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function readHardPartnerGenders(
  answers: Prisma.JsonValue | null | undefined,
): string[] {
  if (!isRecord(answers)) {
    return [];
  }
  const value = answers[HARD_MATCH_KEYS.partnerGenders];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim().length > 0,
  );
}

export function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function readDashboardMatchPayload(
  rawPayload: Prisma.JsonValue | null | undefined,
) {
  if (!isRecord(rawPayload)) {
    return null;
  }

  const payload = rawPayload as unknown as DashboardMatchResponseDto;
  // Legacy snapshots must not expose a pair that never completed introduction.
  if (!payload.introducedAt) return null;
  return {
    id: payload.id,
    score: payload.score,
    introducedAt: payload.introducedAt,
    reportStatus: payload.reportStatus ?? null,

    participants: Array.isArray(payload.participants)
      ? payload.participants.map((participant) => ({
          userId: participant.userId,
          displayName: participant.displayName,
          introLine: participant.introLine,
          // Cached payloads may predate the introduction eligibility gate.
          email: payload.introducedAt ? participant.email : null,
          contact: payload.introducedAt ? participant.contact : null,
          schoolName: participant.schoolName,
          gender: participant.gender ?? null,
          partnerGenders: Array.isArray(participant.partnerGenders)
            ? participant.partnerGenders
            : [],
          weeklyIntent: participant.weeklyIntent ?? null,
        }))
      : [],
  };
}
