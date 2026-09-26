export function buildRevealedCycle(
  id: string,
  codename: string,
  revealAt: string,
) {
  return {
    id,
    codename,
    revealAt: new Date(revealAt),
  };
}
export function buildHistoryMatchParticipant({
  cycleId,
  matchId,
  counterpartUserId = 'user-2',
  score = 82,
  reasons = ['reason'],
  reason = 'reason',
  conversationTopics = ['topic 1', 'topic 2', 'topic 3'],
  introducedAt = null,
  reportStatus = null,
}: {
  cycleId: string;
  matchId: string;
  counterpartUserId?: string;
  score?: number;
  reasons?: string[];
  reason?: string | null;
  conversationTopics?: string[] | null;
  introducedAt?: Date | null;
  reportStatus?: 'OPEN' | 'RESOLVED' | 'DISMISSED' | null;
}) {
  return {
    id: `participant-${cycleId}`,
    cycleId,
    match: {
      cycle: {
        id: cycleId,
        codename: `${cycleId}-codename`,
        revealAt: new Date('2026-01-01T00:00:00.000Z'),
        status: 'REVEALED',
      },
      id: matchId,
      score,
      reasons,
      reason,
      conversationTopics,
      introducedAt,
      reports: reportStatus ? [{ status: reportStatus }] : [],
      participants: [
        {
          userId: 'user-1',
          user: {
            email: 'user-1@example.com',
            displayName: 'User 1',
            profile: { headline: 'hello' },
            school: { name: 'School A' },
            questionnaireResponse: null,
          },
        },
        {
          userId: counterpartUserId,
          user: {
            email: `${counterpartUserId}@example.com`,
            displayName: 'User 2',
            profile: { headline: 'world' },
            school: { name: 'School B' },
            questionnaireResponse: null,
          },
        },
      ],
    },
  };
}
export function buildSnapshotMatchPayload(
  matchParticipant: ReturnType<typeof buildHistoryMatchParticipant>,
  options: { hideSensitiveFields?: boolean; reportStatus?: string | null } = {},
) {
  const hideSensitiveFields = options.hideSensitiveFields ?? false;

  return {
    id: matchParticipant.match.id,
    score: matchParticipant.match.score,
    reasons: hideSensitiveFields ? [] : matchParticipant.match.reasons,
    reason: hideSensitiveFields ? null : matchParticipant.match.reason,
    conversationTopics: hideSensitiveFields
      ? []
      : (matchParticipant.match.conversationTopics ?? []),
    introducedAt: matchParticipant.match.introducedAt?.toISOString() ?? null,
    reportStatus: options.reportStatus ?? null,
    participants: hideSensitiveFields
      ? []
      : matchParticipant.match.participants.map((participant) => ({
          userId: participant.userId,
          displayName: participant.user.displayName,
          introLine: participant.user.profile?.headline ?? null,
          email: matchParticipant.match.introducedAt
            ? participant.user.email
            : null,
          schoolName: participant.user.school?.name ?? null,
        })),
  };
}
export function buildDashboardSnapshotRecord({
  cycle,
  participationStatus,
  matchParticipant,
  blocks,
}: {
  cycle: { id: string; codename: string; revealAt: Date };
  participationStatus: 'OPTED_IN' | 'OPTED_OUT';
  matchParticipant?: ReturnType<typeof buildHistoryMatchParticipant> | null;
  blocks: Array<{ blockerId: string; blockedId: string }>;
}) {
  if (!matchParticipant) {
    return {
      userId: 'user-1',
      cycleId: cycle.id,
      cycleRevealAt: cycle.revealAt,
      cycleCodename: cycle.codename,
      participationStatus,
      result:
        participationStatus === 'OPTED_IN' ? 'UNMATCHED' : 'NOT_PARTICIPATED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      matchId: null,
      matchPayload: null,
    };
  }

  const counterpart =
    matchParticipant.match.participants.find(
      (participant) => participant.userId !== 'user-1',
    ) ?? null;
  const reportStatus = matchParticipant.match.reports[0]?.status ?? null;
  const limitedReason = reportStatus
    ? 'REPORTED'
    : counterpart &&
        blocks.some(
          (block) =>
            (block.blockerId === 'user-1' &&
              block.blockedId === counterpart.userId) ||
            (block.blockedId === 'user-1' &&
              block.blockerId === counterpart.userId),
        )
      ? 'BLOCKED'
      : null;
  const visibility = limitedReason ? 'LIMITED' : 'VISIBLE';

  return {
    userId: 'user-1',
    cycleId: cycle.id,
    cycleRevealAt: cycle.revealAt,
    cycleCodename: cycle.codename,
    participationStatus,
    result: 'MATCHED',
    visibility,
    limitedReason,
    matchId: matchParticipant.match.id,
    matchPayload: buildSnapshotMatchPayload(matchParticipant, {
      hideSensitiveFields: visibility === 'LIMITED',
      reportStatus,
    }),
  };
}
export function createDashboardPrismaMock({
  revealedCycles,
  recentParticipations = [],
  recentMatches = [],
  blocks = [],
  currentCycle = null,
  currentParticipation = null,
  lastRevealedParticipation = null,
  availableCouponCount = 0,
  couponReadAt = null,
}: {
  revealedCycles: Array<{
    id: string;
    codename: string;
    revealAt: Date;
  }>;
  recentParticipations?: Array<{
    cycleId: string;
    status: 'OPTED_IN' | 'OPTED_OUT';
  }>;
  recentMatches?: unknown[];
  blocks?: Array<{
    blockerId: string;
    blockedId: string;
  }>;
  currentCycle?: {
    id: string;
    codename: string;
    revealAt: Date;
    participationDeadline: Date;
    status: 'DRAFT' | 'OPEN' | 'PREPARING' | 'REVEAL_READY' | 'REVEALED';
  } | null;
  currentParticipation?: {
    status: 'OPTED_IN' | 'OPTED_OUT';
    intent?: 'FRIEND' | 'DATE' | 'BOTH' | null;
  } | null;
  lastRevealedParticipation?: {
    cycleId: string;
    status: 'OPTED_IN' | 'OPTED_OUT';
    cycle: {
      id: string;
      codename: string;
      revealAt: Date;
    };
  } | null;

  availableCouponCount?: number;
  couponReadAt?: Date | null;
}) {
  const matchParticipants = recentMatches as Array<
    ReturnType<typeof buildHistoryMatchParticipant>
  >;
  const participationByCycleId = new Map(
    recentParticipations.map((participation) => [
      participation.cycleId,
      participation.status,
    ]),
  );
  const matchByCycleId = new Map(
    matchParticipants.map((matchParticipant) => [
      matchParticipant.cycleId,
      matchParticipant,
    ]),
  );
  const snapshotRecords = [
    ...revealedCycles
      .filter((cycle) => participationByCycleId.get(cycle.id) === 'OPTED_IN')
      .map((cycle) =>
        buildDashboardSnapshotRecord({
          cycle,
          participationStatus:
            participationByCycleId.get(cycle.id) ?? 'OPTED_OUT',
          matchParticipant: matchByCycleId.get(cycle.id) ?? null,
          blocks,
        }),
      ),
    ...(lastRevealedParticipation &&
    !revealedCycles.some(
      (cycle) => cycle.id === lastRevealedParticipation.cycleId,
    )
      ? [
          buildDashboardSnapshotRecord({
            cycle: lastRevealedParticipation.cycle,
            participationStatus: lastRevealedParticipation.status,
            matchParticipant:
              matchByCycleId.get(lastRevealedParticipation.cycleId) ?? null,
            blocks,
          }),
        ]
      : []),
  ].sort(
    (left, right) =>
      right.cycleRevealAt.getTime() - left.cycleRevealAt.getTime(),
  );

  return {
    $queryRaw: jest.fn().mockResolvedValue([
      ...revealedCycles.map((cycle) => ({
        ...cycle,
        kind: 'RECENT',
        status: 'REVEALED',
        participationDeadline: cycle.revealAt,
        participationStatus: participationByCycleId.get(cycle.id) ?? null,
        intent: null,
      })),
      ...(currentCycle
        ? [
            {
              ...currentCycle,
              kind: 'CURRENT',
              participationStatus: currentParticipation?.status ?? null,
              intent: currentParticipation?.intent ?? null,
            },
          ]
        : []),
      ...(lastRevealedParticipation
        ? [
            {
              ...lastRevealedParticipation.cycle,
              kind: 'LAST_PARTICIPATION',
              status: 'REVEALED',
              participationDeadline: lastRevealedParticipation.cycle.revealAt,
              participationStatus: lastRevealedParticipation.status,
              intent: null,
            },
          ]
        : []),
    ]),
    userProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    questionnaireResponse: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    matchCycle: {
      findFirst: jest.fn().mockResolvedValue(currentCycle),
      findMany: jest.fn().mockResolvedValue(revealedCycles),
    },
    cycleParticipation: {
      findFirst: jest.fn().mockResolvedValue(lastRevealedParticipation),
      findUnique: jest.fn().mockResolvedValue(currentParticipation),
    },
    coupon: {
      count: jest.fn().mockResolvedValue(availableCouponCount),
    },
    couponReadState: {
      findUnique: jest
        .fn()
        .mockResolvedValue(couponReadAt ? { readAt: couponReadAt } : null),
    },
    userCycleDashboardSnapshot: {
      findFirst: jest.fn().mockImplementation(() => snapshotRecords[0] ?? null),
      findMany: jest
        .fn()
        .mockImplementation(
          (args?: { where?: { cycleId?: { in?: string[] } } }) => {
            const cycleIds = args?.where?.cycleId?.in;
            if (!cycleIds) {
              return snapshotRecords;
            }

            return snapshotRecords.filter((snapshot) =>
              cycleIds.includes(snapshot.cycleId),
            );
          },
        ),
    },
  };
}
