import { BadRequestException } from '@nestjs/common';
import {
  hardMatchFieldSignature,
  hardMatchSignatureFieldKeys,
  HARD_MATCH_WEIGHT_ACK,
  HARD_MATCH_WEIGHT_KEYS,
} from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { AccountService } from './account.service';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';

// A fully-confirmed hard-match signature map: every enum field signed against
// the current option set, plus an explicit empty-weight confirmation. Fixtures
// attach this so they don't trip the (intended) "stale default" attention.
function buildConfirmedHardMatchSignatures(
  exclude: readonly string[] = [],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const key of hardMatchSignatureFieldKeys()) {
    if (exclude.includes(key)) continue;
    const sig = hardMatchFieldSignature(key);
    if (sig) map[key] = sig;
  }
  for (const key of HARD_MATCH_WEIGHT_KEYS) {
    if (exclude.includes(key)) continue;
    map[key] = HARD_MATCH_WEIGHT_ACK;
  }
  return map;
}
import { QuestionnaireService } from '../questionnaire/questionnaire.service';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';

// Build a real QuestionnaireService whose validateAnswers / sanitizeStoredAnswers
// are pure helpers, then stub getCurrentVersion to inject the schema we want.
function buildQuestionnaireServiceWithSchema(payload: {
  id?: string;
  questions: Array<{
    key: string;
    prompt: string;
    type: 'SINGLE_SELECT' | 'MULTI_SELECT' | 'SCALE';
    required: boolean;
    options?: Array<{ value: string; label?: string }>;
    selectionLimit?: number | null;
  }>;
  schools: Array<{ id: string; name?: string }>;
}) {
  const service = new QuestionnaireService({} as never);
  const questionnairePayload = {
    id: payload.id ?? 'q-test',
    questions: payload.questions.map((q, index) => ({
      id: `${q.key}-id`,
      versionId: payload.id ?? 'q-test',
      key: q.key,
      prompt: q.prompt,
      description: null,
      type: q.type,
      weight: 1,
      order: index,
      required: q.required,
      selectionLimit: q.selectionLimit ?? null,
      options: (q.options ?? []).map((o) => ({
        value: o.value,
        label: o.label ?? o.value,
      })),
    })),
    schools: payload.schools.map((s) => ({
      id: s.id,
      name: s.name ?? s.id,
    })),
  };
  jest
    .spyOn(service, 'getCurrentVersion')
    .mockResolvedValue(questionnairePayload as never);
  return service;
}

function buildRevealedCycle(id: string, codename: string, revealAt: string) {
  return {
    id,
    codename,
    revealAt: new Date(revealAt),
  };
}

function buildHistoryMatchParticipant({
  cycleId,
  matchId,
  counterpartUserId = 'user-2',
  score = 82,
  reasons = ['reason'],
  reason = 'reason',
  conversationTopics = ['topic 1', 'topic 2', 'topic 3'],
  introducedAt = null,
  currentUserRequestedAt = null,
  counterpartRequestedAt = null,
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
  currentUserRequestedAt?: Date | null;
  counterpartRequestedAt?: Date | null;
  reportStatus?: 'OPEN' | 'RESOLVED' | 'DISMISSED' | null;
}) {
  return {
    id: `participant-${cycleId}`,
    cycleId,
    contactRequestedAt: currentUserRequestedAt,
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
          contactRequestedAt: currentUserRequestedAt,
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
          contactRequestedAt: counterpartRequestedAt,
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

function buildSnapshotMatchPayload(
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
    currentUserRequestedAt:
      matchParticipant.contactRequestedAt?.toISOString() ?? null,
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
          contactRequestedAt:
            participant.contactRequestedAt?.toISOString() ?? null,
        })),
  };
}

function buildDashboardSnapshotRecord({
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

type IntroductionEmailPayload = {
  requester: {
    publicContact: { type: string; label: string; value: string };
  };
  recipient: {
    publicContact: { type: string; label: string; value: string };
  };
};

function createDashboardPrismaMock({
  revealedCycles,
  recentParticipations = [],
  recentMatches = [],
  blocks = [],
  currentCycle = null,
  currentParticipation = null,
  lastRevealedParticipation = null,
  dashboardMeetupMatch = null,
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
  dashboardMeetupMatch?: {
    id: string;
    introducedAt: Date | null;
    participants: Array<{ userId: string }>;
    meetupSession: Record<string, unknown> | null;
  } | null;
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
    userProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    questionnaireResponse: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    matchCycle: {
      findFirst: jest.fn().mockResolvedValue(currentCycle),
      findMany: jest.fn().mockResolvedValue(revealedCycles),
    },
    match: {
      findUnique: jest.fn().mockResolvedValue(dashboardMeetupMatch),
    },
    matchFeedback: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    cycleParticipation: {
      findFirst: jest.fn().mockResolvedValue(lastRevealedParticipation),
      findUnique: jest.fn().mockResolvedValue(currentParticipation),
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

function buildSubmittedQuestionnaireResponse(
  overrides: Partial<{
    answers: Record<string, unknown>;
    draftAnswers: Record<string, unknown> | null;
    submittedAt: Date;
  }> = {},
) {
  return {
    answers: {
      [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
      [HARD_MATCH_KEYS.partnerAgeMin]: 18,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: '男',
      [HARD_MATCH_KEYS.partnerGenders]: ['女'],
      [HARD_MATCH_KEYS.nationality]: '中国',
      [HARD_MATCH_KEYS.partnerNationalities]: [],
      [HARD_MATCH_KEYS.languages]: ['中文'],
      [HARD_MATCH_KEYS.partnerLanguages]: [],
      [HARD_MATCH_KEYS.looks]: '普通人',
      [HARD_MATCH_KEYS.partnerLooks]: ['普通人'],
      [HARD_MATCH_KEYS.heightCm]: 175,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 195,
      [HARD_MATCH_KEYS.weightKg]: null,
      [HARD_MATCH_KEYS.partnerWeightMin]: null,
      [HARD_MATCH_KEYS.partnerWeightMax]: null,
      [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢徒步。',
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
      [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [],
      ...(overrides.answers ?? {}),
    },
    draftAnswers:
      overrides.draftAnswers === undefined ? null : overrides.draftAnswers,
    submittedAt: overrides.submittedAt ?? new Date('2026-04-01T00:00:00.000Z'),
  };
}

function buildSubmittedHardMatchDraftForm(
  overrides: Record<string, unknown> = {},
) {
  // Numeric fields are stored as strings in the draft so they round-trip
  // through readAllowedNumberString / readRequiredIntegerInput unchanged.
  return {
    birthYear: '2000',
    birthMonth: '05',
    birthDay: '10',
    partnerAgeMin: '18',
    partnerAgeMax: '30',
    gender: '男',
    partnerGenders: ['女'],
    nationality: '中国',
    partnerNationalities: ['中国'],
    languages: ['中文'],
    partnerLanguages: ['中文'],
    looks: '普通人',
    partnerLooks: ['普通人'],
    heightCm: '175',
    partnerHeightMin: '150',
    partnerHeightMax: '195',
    oneLinerIntro: '喜欢徒步。',
    ...overrides,
  };
}

function createDashboardSnapshotServiceMock() {
  return {
    ensureUserSnapshotCoverage: jest.fn().mockResolvedValue(undefined),
    readDashboardMatchPayload: jest
      .fn()
      .mockImplementation((rawPayload: unknown) =>
        typeof rawPayload === 'object' && rawPayload !== null
          ? rawPayload
          : null,
      ),
    syncMatchSnapshots: jest.fn().mockResolvedValue(undefined),
    syncUserMatchSnapshots: jest.fn().mockResolvedValue(undefined),
  };
}

function buildDashboardMeetupSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'session-1',
    matchId: 'match-1',
    status: 'ACTIVE',
    currentProposalId: 'proposal-1',
    confirmedTimeOptionId: null,
    confirmedLocationOptionId: null,
    finalConfirmRequiredByUserId: null,
    reopenedFromLockedStartsAt: null,
    lockedAt: null,
    canceledAt: null,
    canceledByUserId: null,
    effectiveExpirationWeeks: 1,
    expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    archiveEligibleAt: null,
    lastActiveAt: new Date('2026-05-14T10:00:00.000Z'),
    confirmedTimeOption: null,
    confirmedLocationOption: null,
    participants: [
      {
        userId: 'user-1',
        turnState: 'REQUIRED',
        revisionUsedAt: null,
        lastSeenAt: null,
        user: { displayName: 'User 1' },
      },
      {
        userId: 'user-2',
        turnState: 'WAITING',
        revisionUsedAt: null,
        lastSeenAt: null,
        user: { displayName: 'User 2' },
      },
    ],
    ...overrides,
  };
}

describe('AccountService', () => {
  afterEach(() => {
    jest.useRealTimers();
    clearStickyParticipationCache();
  });

  it('rejects participation changes after the deadline', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 60_000),
        }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects opt-in without an explicit weekly intent', async () => {
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when the weekly intent is not one of the allowed values', async () => {
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', {
        optIn: true,
        intent: 'INVALID' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when the account is not ACTIVE', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'SUSPENDED', schoolId: 'school-bupt' }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { status: true, schoolId: true },
    });
  });

  it('rejects opt-in when the questionnaire has not been submitted yet', async () => {
    const upsert = jest.fn();
    const findUniqueResponse = jest.fn().mockResolvedValue(null);
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: findUniqueResponse,
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findUniqueResponse).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { answers: true, draftAnswers: true, submittedAt: true },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when the saved questionnaire only has a draft (submittedAt is null)', async () => {
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue({
          ...buildSubmittedQuestionnaireResponse(),
          submittedAt: null,
        }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when the submitted answers no longer parse as valid hard-match data', async () => {
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue({
          // Legacy / corrupted record: submittedAt is set but the hard-match
          // payload is missing required keys.
          answers: { [HARD_MATCH_KEYS.gender]: '男' },
          submittedAt: new Date('2026-04-01T00:00:00.000Z'),
        }),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when an unsaved draft has emptied a required soft question', async () => {
    const upsert = jest.fn();
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            // Draft cleared the required soft question after the original
            // submission. The user-facing progress bar drops below 100% but
            // submittedAt remains non-null.
            draftAnswers: {
              softAnswers: {},
              hardMatchForm: buildSubmittedHardMatchDraftForm(),
              displayName: 'User',
            },
          }),
        ),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      questionnaireService,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toMatchObject({
      message:
        'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects opt-in when an unsaved draft clears a required hard-match field', async () => {
    const upsert = jest.fn();
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            draftAnswers: {
              softAnswers: { ['value-1']: 'high' },
              hardMatchForm: buildSubmittedHardMatchDraftForm({
                gender: '',
              }),
              displayName: 'User',
            },
          }),
        ),
      },
      cycleParticipation: {
        upsert,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      questionnaireService,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toMatchObject({
      message:
        'Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows opt-in when a draft exists but still satisfies every required field', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_IN',
      intent: 'BOTH',
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const questionnaireService = buildQuestionnaireServiceWithSchema({
      questions: [
        {
          key: 'value-1',
          prompt: 'How important is honesty?',
          type: 'SINGLE_SELECT',
          required: true,
          options: [{ value: 'low' }, { value: 'high' }],
        },
      ],
      schools: [{ id: 'school-bupt' }],
    });
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue(
          buildSubmittedQuestionnaireResponse({
            answers: { ['value-1']: 'high' },
            draftAnswers: {
              softAnswers: { ['value-1']: 'low' },
              hardMatchForm: buildSubmittedHardMatchDraftForm(),
              displayName: 'User',
            },
          }),
        ),
      },
      cycleParticipation: {
        upsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      questionnaireService,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.setParticipation('user-1', { optIn: true, intent: 'BOTH' });

    expect(upsert).toHaveBeenCalled();
  });

  it('persists the chosen intent and writes it into the audit log on opt-in', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_IN',
      intent: 'DATE',
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest
          .fn()
          .mockResolvedValue(buildSubmittedQuestionnaireResponse()),
      },
      cycleParticipation: {
        upsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.setParticipation('user-1', { optIn: true, intent: 'DATE' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'OPTED_IN',
          intent: 'DATE',
        }) as object,
        update: expect.objectContaining({
          status: 'OPTED_IN',
          intent: 'DATE',
        }) as object,
      }),
    );
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'participation.updated',
        metadata: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          intent: 'DATE',
        },
      },
    });
  });

  it('still rejects opt-in switching intent when the saved questionnaire was reset to a draft after the first opt-in', async () => {
    // Defense-in-depth: a user who was already OPTED_IN with a complete
    // questionnaire is allowed to flip intent (DATE -> BOTH etc), but only
    // if the questionnaire is still complete. If admin tooling, a data
    // migration, or a manual reset wipes submittedAt, the next intent
    // change must surface the contract failure instead of silently keeping
    // them in OPTED_IN with unmatchable data.
    const upsert = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', schoolId: 'school-bupt' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue({
          ...buildSubmittedQuestionnaireResponse(),
          submittedAt: null,
        }),
      },
      cycleParticipation: { upsert },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lets a user opt out without requiring a complete questionnaire', async () => {
    // Symmetric to the gate above: if a user somehow ended up OPTED_IN
    // before the questionnaire gate was added, opt-out must still work
    // without any questionnaire lookup so they can leave the cycle.
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_OUT',
      intent: null,
    });
    const findUniqueQuestionnaire = jest.fn();
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      questionnaireResponse: { findUnique: findUniqueQuestionnaire },
      cycleParticipation: { upsert },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.setParticipation('user-1', { optIn: false });

    expect(findUniqueQuestionnaire).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'OPTED_OUT' }) as object,
      }),
    );
  });

  it('clears intent on opt-out so rejoining requires an explicit fresh choice', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'participation-1',
      status: 'OPTED_OUT',
      intent: null,
    });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      cycleParticipation: {
        upsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.setParticipation('user-1', { optIn: false });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'OPTED_OUT',
          intent: null,
          optedInAt: null,
        }) as object,
        update: expect.objectContaining({
          status: 'OPTED_OUT',
          intent: null,
          optedInAt: null,
        }) as object,
      }),
    );
  });

  it('rejects participation changes once the current cycle is preparing', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects participation changes once the current cycle is reveal-ready', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'REVEAL_READY',
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters stale questionnaire answers down to the current questionnaire keys', async () => {
    const service = new AccountService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-cuc',
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-old',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
              removed_question: 'dropped',
              [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
              [HARD_MATCH_KEYS.school]: 'school-bupt',
              [HARD_MATCH_KEYS.excludedPartnerSchools]: [
                'school-bupt',
                'school-deleted',
              ],
              [HARD_MATCH_KEYS.oneLinerIntro]:
                '测试用一句话介绍，用于回归问卷过滤。',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures:
              buildConfirmedHardMatchSignatures(),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: null,
                },
              ],
            },
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = await service.getQuestionnaire('user-1');

    expect(result).toMatchObject({
      versionId: 'version-old',
      currentVersionId: 'version-current',
      answers: {
        current_question: 'kept',
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
        [HARD_MATCH_KEYS.school]: 'school-cuc',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-bupt'],
        [HARD_MATCH_KEYS.oneLinerIntro]: '测试用一句话介绍，用于回归问卷过滤。',
      },
      submittedAt: '2026-04-18T12:00:00.000Z',
      draft: null,
      attention: {
        currentVersionId: 'version-current',
        acknowledgedKeys: [],
        pendingUpdatedKeys: [],
        missingRequiredKeys: [],
        pendingKeys: [],
        items: [],
      },
    });
    expect(result!.answers).not.toHaveProperty('removed_question');
  });

  it('marks current-version questionnaire additions as pending account-level attention', async () => {
    const service = new AccountService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-bupt',
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-old',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
              [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
              [HARD_MATCH_KEYS.school]: 'school-bupt',
              [HARD_MATCH_KEYS.oneLinerIntro]: '喜欢徒步。',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures:
              buildConfirmedHardMatchSignatures(),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: [{ value: 'kept', label: 'Kept' }],
                },
              ],
            },
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'kept', label: 'Kept' }],
            },
            {
              key: 'new_question',
              prompt: 'New question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'new', label: 'New' }],
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getQuestionnaire('user-1')).resolves.toMatchObject({
      versionId: 'version-old',
      currentVersionId: 'version-current',
      attention: {
        currentVersionId: 'version-current',
        acknowledgedKeys: [],
        pendingUpdatedKeys: ['new_question'],
        missingRequiredKeys: ['new_question'],
        pendingKeys: ['new_question'],
        items: [
          {
            key: 'new_question',
            prompt: 'New question',
            updated: true,
            missingRequired: true,
            acknowledged: false,
          },
        ],
      },
    });
  });

  it('marks newly introduced hard-match fields as pending attention', async () => {
    const legacyAnswers = { ...buildSubmittedQuestionnaireResponse().answers };
    delete legacyAnswers[HARD_MATCH_KEYS.partnerLanguages];

    const service = new AccountService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-bupt',
          }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-old',
            answers: {
              ...legacyAnswers,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures: buildConfirmedHardMatchSignatures([
              HARD_MATCH_KEYS.partnerLanguages,
            ]),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: [{ value: 'kept', label: 'Kept' }],
                },
              ],
            },
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'kept', label: 'Kept' }],
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getQuestionnaire('user-1')).resolves.toMatchObject({
      attention: {
        pendingUpdatedKeys: [HARD_MATCH_KEYS.partnerLanguages],
        missingRequiredKeys: [],
        pendingKeys: [HARD_MATCH_KEYS.partnerLanguages],
        items: [
          {
            key: HARD_MATCH_KEYS.partnerLanguages,
            prompt: '希望对方的语言',
            updated: true,
            missingRequired: false,
            acknowledged: false,
          },
        ],
      },
    });
  });

  it('flags stale-signature enum fields and unconfirmed empty weights', async () => {
    const service = new AccountService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-bupt' }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: 'version-current',
            acknowledgedQuestionnaireKeys: ['current_question'],
            // Confirmed EXCEPT: looks carries a stale signature, and the empty
            // weights were never explicitly confirmed.
            acknowledgedHardMatchSignatures: {
              ...buildConfirmedHardMatchSignatures([
                HARD_MATCH_KEYS.weightKg,
                HARD_MATCH_KEYS.partnerWeightMin,
                HARD_MATCH_KEYS.partnerWeightMax,
              ]),
              [HARD_MATCH_KEYS.looks]: 'v1:stale-signature',
            },
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: [{ value: 'kept', label: 'Kept' }],
                },
              ],
            },
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'kept', label: 'Kept' }],
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest
          .fn()
          .mockReturnValue({ current_question: 'kept' }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = (await service.getQuestionnaire('user-1')) as {
      attention: { pendingUpdatedKeys: string[] };
    };
    const pending = result.attention.pendingUpdatedKeys;

    expect(pending).toEqual(
      expect.arrayContaining([
        HARD_MATCH_KEYS.looks,
        HARD_MATCH_KEYS.weightKg,
        HARD_MATCH_KEYS.partnerWeightMin,
        HARD_MATCH_KEYS.partnerWeightMax,
      ]),
    );
    // Confirmed enum fields and the unchanged soft question stay quiet.
    expect(pending).not.toContain(HARD_MATCH_KEYS.gender);
    expect(pending).not.toContain('current_question');
  });

  it('clears the weight nudge once the empty weight is acknowledged', async () => {
    const service = new AccountService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-bupt' }),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            versionId: 'version-current',
            answers: {
              ...buildSubmittedQuestionnaireResponse().answers,
              current_question: 'kept',
            },
            acknowledgedQuestionnaireVersionId: 'version-current',
            acknowledgedQuestionnaireKeys: ['current_question'],
            // Fully confirmed, including explicit empty-weight acknowledgement.
            acknowledgedHardMatchSignatures:
              buildConfirmedHardMatchSignatures(),
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            version: {
              questions: [
                {
                  key: 'current_question',
                  prompt: 'Current question',
                  description: null,
                  type: 'SINGLE_SELECT',
                  required: true,
                  selectionLimit: null,
                  options: [{ value: 'kept', label: 'Kept' }],
                },
              ],
            },
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              description: null,
              type: 'SINGLE_SELECT',
              required: true,
              selectionLimit: null,
              options: [{ value: 'kept', label: 'Kept' }],
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
          ],
        }),
        sanitizeStoredAnswers: jest
          .fn()
          .mockReturnValue({ current_question: 'kept' }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const result = (await service.getQuestionnaire('user-1')) as {
      attention: { pendingUpdatedKeys: string[] };
    };

    expect(result.attention.pendingUpdatedKeys).not.toContain(
      HARD_MATCH_KEYS.partnerWeightMin,
    );
    expect(result.attention.pendingUpdatedKeys).not.toContain(
      HARD_MATCH_KEYS.looks,
    );
  });

  it('persists questionnaire attention acknowledgement keys per current version', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        acknowledgedQuestionnaireKeys: [
          'existing_question',
          'new_question',
          HARD_MATCH_KEYS.partnerLanguages,
        ],
      },
    ]);
    const findUnique = jest.fn();
    const service = new AccountService(
      {
        $queryRaw: queryRaw,
        questionnaireResponse: {
          findUnique,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-current',
          questions: [{ key: 'existing_question' }, { key: 'new_question' }],
        }),
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.acknowledgeQuestionnaireItems('user-1', {
        versionId: 'version-current',
        keys: [
          'new_question',
          HARD_MATCH_KEYS.partnerLanguages,
          'new_question',
          ' ',
        ],
      }),
    ).resolves.toEqual({
      currentVersionId: 'version-current',
      acknowledgedKeys: [
        'existing_question',
        'new_question',
        HARD_MATCH_KEYS.partnerLanguages,
      ],
    });

    expect(findUnique).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const [queryTemplate] = queryRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(Array.from(queryTemplate).join('')).toContain(
      'UPDATE "QuestionnaireResponse" AS response',
    );
  });

  it('normalizes profile display names before updating the user row', async () => {
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const profileFindUnique = jest.fn().mockResolvedValue(null);
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new AccountService(
      {
        user: {
          update: userUpdate,
        },
        userProfile: {
          findUnique: profileFindUnique,
        },
      } as never,
      {} as never,
      {} as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.updateProfile('user-1', { displayName: '  New Name  ' }),
    ).resolves.toBeNull();

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: 'New Name' },
    });
    expect(
      dashboardSnapshotService.syncUserMatchSnapshots,
    ).toHaveBeenCalledWith('user-1');

    await expect(
      service.updateProfile('user-1', { displayName: 'A'.repeat(31) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('submits a complete questionnaire and clears any draft payload', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'response-1' });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction = jest
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
    const validateAnswers = jest.fn().mockReturnValue({
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      current_question: 'kept',
    });
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'kept',
    });
    const service = new AccountService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: null,
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: '测试昵称',
        answers: {
          current_question: 'kept',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '165',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toMatchObject({
      saveState: 'SUBMITTED',
      hasDraft: false,
    });

    expect(validateAnswers).toHaveBeenCalledWith(
      [
        {
          key: 'current_question',
          prompt: 'Current question',
          type: 'SINGLE_SELECT',
          required: true,
          options: null,
        },
      ],
      expect.objectContaining({
        current_question: 'kept',
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
        [HARD_MATCH_KEYS.school]: 'school-bupt',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-cuc'],
      }),
      ['school-bupt', 'school-cuc'],
    );
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: '测试昵称' },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-bupt',
            current_question: 'kept',
          },
          draftAnswers: Prisma.DbNull,
          submittedAt: expect.any(Date) as Date,
        }) as object,
        update: expect.objectContaining({
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-bupt',
            current_question: 'kept',
          },
          draftAnswers: Prisma.DbNull,
          submittedAt: expect.any(Date) as Date,
        }) as object,
      }),
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(sanitizeStoredAnswers).toHaveBeenCalledWith(
      [
        {
          key: 'current_question',
          prompt: 'Current question',
          type: 'SINGLE_SELECT',
          required: true,
          options: null,
        },
      ],
      {
        current_question: 'kept',
      },
    );
  });

  it('skips rewriting the user row when the nickname is unchanged', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'response-1' });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction: jest.MockedFunction<
      (operations: Promise<unknown>[]) => Promise<unknown[]>
    > = jest
      .fn()
      .mockImplementation((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      );
    const validateAnswers = jest.fn().mockReturnValue({
      [HARD_MATCH_KEYS.school]: 'school-bupt',
      current_question: 'kept',
    });
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'kept',
    });
    const service = new AccountService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: '测试昵称',
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: '测试昵称',
        answers: {
          current_question: 'kept',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '165',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toMatchObject({
      saveState: 'SUBMITTED',
      hasDraft: false,
    });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1);
    const submittedOperations = transaction.mock.calls[0]?.[0];
    expect(submittedOperations).toBeDefined();
    // upsert + the hard-match signature JSONB merge (no user row rewrite).
    expect(submittedOperations).toHaveLength(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('stores an incomplete questionnaire as a draft without replacing the submitted answers', async () => {
    const upsert: jest.MockedFunction<
      (
        args: Prisma.QuestionnaireResponseUpsertArgs,
      ) => Promise<{ id: string; submittedAt: Date }>
    > = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: 'Draft User',
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: 'Draft User',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    const draftUpsertArgs = upsert.mock.calls[0]?.[0];
    expect(draftUpsertArgs).toBeDefined();
    expect(draftUpsertArgs?.where).toEqual({ userId: 'user-1' });
    expect(draftUpsertArgs?.create.answers).toEqual({});

    const createdDraftPayload = draftUpsertArgs?.create.draftAnswers as Record<
      string,
      unknown
    >;
    expect(createdDraftPayload.displayName).toBe('Draft User');
    expect(createdDraftPayload.softAnswers).toEqual({
      current_question: 'partial-answer',
    });
    expect(createdDraftPayload.hardMatchForm).toMatchObject({
      birthYear: '2000',
      birthMonth: '',
      birthDay: '',
      heightCm: '',
      oneLinerIntro: '喜欢散步。',
    });

    const updatedDraftPayload = draftUpsertArgs?.update.draftAnswers as Record<
      string,
      unknown
    >;
    expect(updatedDraftPayload.displayName).toBe('Draft User');
  });

  it('updates the nickname and draft together when saving an incomplete questionnaire', async () => {
    const upsert: jest.MockedFunction<
      (
        args: Prisma.QuestionnaireResponseUpsertArgs,
      ) => Promise<{ id: string; submittedAt: Date }>
    > = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const transaction = jest
      .fn()
      .mockImplementation(
        (
          callback: (tx: {
            user: { update: typeof userUpdate };
            questionnaireResponse: { upsert: typeof upsert };
          }) => Promise<unknown>,
        ) =>
          callback({
            user: { update: userUpdate },
            questionnaireResponse: { upsert },
          }),
      );
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountService(
      {
        $transaction: transaction,
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: '旧昵称',
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: '新昵称',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { displayName: '新昵称' },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const draftUpsertArgs = upsert.mock.calls[0]?.[0];
    expect(draftUpsertArgs).toBeDefined();
    expect(draftUpsertArgs?.where).toEqual({ userId: 'user-1' });

    const updatedDraftPayload = draftUpsertArgs?.update.draftAnswers as Record<
      string,
      unknown
    >;
    expect(updatedDraftPayload.displayName).toBe('新昵称');
  });

  it('skips rewriting the user row on draft saves when the nickname is unchanged', async () => {
    const upsert = jest.fn().mockResolvedValue({
      id: 'response-1',
      submittedAt: new Date('2026-04-10T08:00:00.000Z'),
    });
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: '测试昵称',
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: '测试昵称',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '',
          birthDay: '',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).resolves.toEqual({
      saveState: 'DRAFT',
      questionnaireSubmittedAt: '2026-04-10T08:00:00.000Z',
      hasDraft: true,
    });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid hard-match values instead of silently saving a draft', async () => {
    const upsert = jest.fn();
    const userUpdate = jest.fn();
    const validateAnswers = jest.fn();
    const sanitizeStoredAnswers = jest.fn().mockReturnValue({
      current_question: 'partial-answer',
    });
    const service = new AccountService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            displayName: null,
            school: {
              id: 'school-bupt',
              name: '北京邮电大学玛丽女王海南学院',
            },
          }),
          update: userUpdate,
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [
            {
              key: 'current_question',
              prompt: 'Current question',
              type: 'SINGLE_SELECT',
              required: true,
              options: null,
            },
          ],
          schools: [
            { id: 'school-bupt', name: '北京邮电大学玛丽女王海南学院' },
            { id: 'school-cuc', name: '中国传媒大学海南国际学院' },
          ],
        }),
        validateAnswers,
        sanitizeStoredAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: '测试昵称',
        answers: {
          current_question: 'partial-answer',
        },
        hardMatchForm: {
          birthYear: '2000',
          birthMonth: '5',
          birthDay: '10',
          partnerAgeMin: '18',
          partnerAgeMax: '30',
          gender: '未知性别',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: '165',
          partnerHeightMin: '160',
          partnerHeightMax: '190',
          oneLinerIntro: '喜欢散步。',
          excludedPartnerSchools: ['school-cuc'],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(validateAnswers).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects questionnaire saves when the current user has no recognized school', async () => {
    const validateAnswers = jest.fn();
    const upsert = jest.fn();
    const service = new AccountService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'user-1',
            school: null,
          }),
        },
        questionnaireResponse: {
          upsert,
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
          id: 'version-1',
          questions: [],
          schools: [],
        }),
        validateAnswers,
      } as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        answers: {},
        hardMatchForm: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(validateAnswers).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns three recent history items in reveal order', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-3',
            status: 'OPTED_IN',
          },
          {
            cycleId: 'cycle-2',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-3',
            matchId: 'match-3',
            introducedAt: new Date('2026-04-03T13:00:00.000Z'),
            currentUserRequestedAt: new Date('2026-04-03T13:05:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-3',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-3',
    });
    expect(dashboard.latestMatchVisibility).toBe('VISIBLE');
    expect(dashboard.latestMatchLimitedReason).toBeNull();
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-3',
      matched: true,
    });
    expect(dashboard.recentMatchHistory).toHaveLength(3);
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      cycleId: 'cycle-3',
      codename: '第三轮',
      participationStatus: 'OPTED_IN',
      result: 'MATCHED',
      visibility: 'VISIBLE',
      limitedReason: null,
      match: {
        id: 'match-3',
      },
    });
    expect(dashboard.recentMatchHistory[1]).toMatchObject({
      cycleId: 'cycle-2',
      participationStatus: 'OPTED_IN',
      result: 'UNMATCHED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      match: null,
    });
    expect(dashboard.recentMatchHistory[2]).toMatchObject({
      cycleId: 'cycle-1',
      participationStatus: 'OPTED_OUT',
      result: 'NOT_PARTICIPATED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      match: null,
    });
  });

  it('keeps latestMatch tied to the last revealed participation cycle', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-4', '第四轮', '2026-04-04T12:00:00.000Z'),
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
    ];
    const olderLatestCycle = buildRevealedCycle(
      'cycle-1',
      '第一轮',
      '2026-04-01T12:00:00.000Z',
    );
    const service = new AccountService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-4',
            status: 'OPTED_OUT',
          },
          {
            cycleId: 'cycle-3',
            status: 'OPTED_OUT',
          },
          {
            cycleId: 'cycle-2',
            status: 'OPTED_OUT',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: olderLatestCycle,
        },
      }) as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
    });
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory).toHaveLength(3);
    expect(dashboard.recentMatchHistory.map((item) => item.cycleId)).toEqual([
      'cycle-4',
      'cycle-3',
      'cycle-2',
    ]);
  });

  it('queries latest and recent dashboard snapshots only from revealed candidate cycles', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-4', '第四轮', '2026-04-04T12:00:00.000Z'),
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
    ];
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: buildRevealedCycle(
          'cycle-1',
          '第一轮',
          '2026-04-01T12:00:00.000Z',
        ),
      },
    });
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.getDashboard('user-1');

    expect(prisma.userCycleDashboardSnapshot.findFirst).toHaveBeenCalledTimes(
      1,
    );
    const [latestSnapshotQuery] = prisma.userCycleDashboardSnapshot.findFirst
      .mock.calls[0] as [Record<string, unknown>];
    expect(prisma.userCycleDashboardSnapshot.findMany).toHaveBeenCalledTimes(1);
    const [recentSnapshotsQuery] = prisma.userCycleDashboardSnapshot.findMany
      .mock.calls[0] as [Record<string, unknown>];

    expect(latestSnapshotQuery.where).toEqual({
      userId: 'user-1',
      cycleId: {
        in: ['cycle-4', 'cycle-3', 'cycle-2', 'cycle-1'],
      },
    });
    expect(recentSnapshotsQuery.where).toEqual({
      userId: 'user-1',
      cycleId: {
        in: ['cycle-4', 'cycle-3', 'cycle-2'],
      },
    });
  });

  it('expires dashboard meetup sessions with CAS and writes audit', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));

    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-05-01T12:00:00.000Z'),
    ];
    const expiredSession = buildDashboardMeetupSession({
      status: 'EXPIRED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      expiresAt: null,
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const session = buildDashboardMeetupSession({
      currentProposalId: 'proposal-1',
      expiresAt: new Date('2026-05-14T09:59:00.000Z'),
    });
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
      recentMatches: [
        buildHistoryMatchParticipant({
          cycleId: 'cycle-1',
          matchId: 'match-1',
          introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        }),
      ],
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: revealedCycles[0],
      },
      dashboardMeetupMatch: {
        id: 'match-1',
        introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
        meetupSession: session,
      },
    });
    const tx = {
      meetupSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(expiredSession),
      },
      meetupProposal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      meetupOption: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      meetupParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    (prisma as { $transaction?: jest.Mock }).$transaction = jest.fn(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.meetupSummary).toMatchObject({
      sessionId: 'session-1',
      status: 'EXPIRED',
      terminalText: expect.any(String) as string,
    });
    expect(dashboard.tasks).toEqual([]);
    expect(tx.meetupSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'ACTIVE',
        currentProposalId: 'proposal-1',
        finalConfirmRequiredByUserId: null,
        expiresAt: {
          lte: new Date('2026-05-14T10:00:00.000Z'),
        },
      },
      data: expect.objectContaining({
        status: 'EXPIRED',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
      }) as object,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'meetup.expired',
        metadata: {
          sessionId: 'session-1',
          matchId: 'match-1',
        },
      },
    });
  });

  it('archives dashboard meetup sessions with CAS and writes audit', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));

    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-05-01T12:00:00.000Z'),
    ];
    const archivedSession = buildDashboardMeetupSession({
      status: 'ARCHIVED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      expiresAt: null,
      archiveEligibleAt: new Date('2026-05-14T09:59:00.000Z'),
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const session = buildDashboardMeetupSession({
      status: 'LOCKED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      expiresAt: null,
      archiveEligibleAt: new Date('2026-05-14T09:59:00.000Z'),
      confirmedTimeOptionId: 'time-1',
      confirmedLocationOptionId: 'location-1',
      confirmedTimeOption: {
        startsAt: new Date('2026-05-14T08:00:00.000Z'),
        endsAt: new Date('2026-05-14T09:00:00.000Z'),
      },
      confirmedLocationOption: {
        placeName: 'Cafe',
      },
    });
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
      recentMatches: [
        buildHistoryMatchParticipant({
          cycleId: 'cycle-1',
          matchId: 'match-1',
          introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        }),
      ],
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: revealedCycles[0],
      },
      dashboardMeetupMatch: {
        id: 'match-1',
        introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
        meetupSession: session,
      },
    });
    const tx = {
      meetupSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(archivedSession),
      },
      meetupParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    (prisma as { $transaction?: jest.Mock }).$transaction = jest.fn(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.meetupSummary).toMatchObject({
      sessionId: 'session-1',
      status: 'ARCHIVED',
      terminalText: expect.any(String) as string,
    });
    expect(tx.meetupSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'LOCKED',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
        archiveEligibleAt: {
          lte: new Date('2026-05-14T10:00:00.000Z'),
        },
      },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
      }) as object,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'meetup.archived',
        metadata: {
          sessionId: 'session-1',
          matchId: 'match-1',
        },
      },
    });
  });

  it('does not write dashboard lifecycle side effects when CAS loses to a terminal state', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));

    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-05-01T12:00:00.000Z'),
    ];
    const canceledSession = buildDashboardMeetupSession({
      status: 'CANCELED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      canceledAt: new Date('2026-05-14T09:59:30.000Z'),
      canceledByUserId: 'user-2',
      expiresAt: null,
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const session = buildDashboardMeetupSession({
      currentProposalId: 'proposal-1',
      expiresAt: new Date('2026-05-14T09:59:00.000Z'),
    });
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
      recentMatches: [
        buildHistoryMatchParticipant({
          cycleId: 'cycle-1',
          matchId: 'match-1',
          introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        }),
      ],
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: revealedCycles[0],
      },
      dashboardMeetupMatch: {
        id: 'match-1',
        introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
        meetupSession: session,
      },
    });
    const tx = {
      meetupSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(canceledSession),
      },
      meetupProposal: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      meetupOption: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      meetupParticipant: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    (prisma as { $transaction?: jest.Mock }).$transaction = jest.fn(
      (callback: (transaction: typeof tx) => unknown) => callback(tx),
    );
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.meetupSummary).toMatchObject({
      sessionId: 'session-1',
      status: 'CANCELED',
      terminalText: expect.any(String) as string,
    });
    expect(tx.meetupProposal.updateMany).not.toHaveBeenCalled();
    expect(tx.meetupOption.updateMany).not.toHaveBeenCalled();
    expect(tx.meetupParticipant.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('surfaces a dashboard todo when the counterpart cancels a confirmed meetup', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-05-01T12:00:00.000Z'),
    ];
    const canceledAt = new Date('2026-05-14T09:59:30.000Z');
    const canceledSession = buildDashboardMeetupSession({
      status: 'CANCELED',
      currentProposalId: null,
      confirmedTimeOptionId: 'time-1',
      confirmedLocationOptionId: 'location-1',
      finalConfirmRequiredByUserId: null,
      lockedAt: new Date('2026-05-13T10:00:00.000Z'),
      canceledAt,
      canceledByUserId: 'user-2',
      expiresAt: null,
      lastActiveAt: canceledAt,
      confirmedTimeOption: {
        startsAt: new Date('2026-05-15T08:00:00.000Z'),
        endsAt: new Date('2026-05-15T09:00:00.000Z'),
      },
      confirmedLocationOption: {
        placeName: 'Cafe',
      },
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: new Date('2026-05-14T09:00:00.000Z'),
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
      recentMatches: [
        buildHistoryMatchParticipant({
          cycleId: 'cycle-1',
          matchId: 'match-1',
          introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        }),
      ],
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: revealedCycles[0],
      },
      dashboardMeetupMatch: {
        id: 'match-1',
        introducedAt: new Date('2026-05-01T13:00:00.000Z'),
        participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
        meetupSession: canceledSession,
      },
    });
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.tasks).toEqual([
      {
        id: 'meetup-canceled:session-1',
        type: 'MEETUP',
        priority: 11,
        title: '第一次见面已取消',
        text: '对方取消了该次见面',
        href: '/dashboard/meetup/session-1',
        userTurnStatus: 'NONE',
        progressStatus: 'CANCELED',
        matchId: 'match-1',
        sessionId: 'session-1',
        updatedAt: '2026-05-14T09:59:30.000Z',
      },
    ]);
  });

  it('limits reported history matches and keeps the match id for reuse', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-1',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            reportStatus: 'OPEN',
            currentUserRequestedAt: new Date('2026-04-01T12:30:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
      reportStatus: 'OPEN',
      reasons: [],
      participants: [],
    });
    expect(dashboard.latestMatchVisibility).toBe('LIMITED');
    expect(dashboard.latestMatchLimitedReason).toBe('REPORTED');
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      result: 'MATCHED',
      visibility: 'LIMITED',
      limitedReason: 'REPORTED',
      match: {
        id: 'match-1',
        reportStatus: 'OPEN',
        reasons: [],
        participants: [],
      },
    });
  });

  it('limits blocked history matches but still returns latestMatch with LIMITED visibility', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-1',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            counterpartUserId: 'user-2',
          }),
        ],
        blocks: [
          {
            blockerId: 'user-1',
            blockedId: 'user-2',
          },
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
      reasons: [],
      participants: [],
    });
    expect(dashboard.latestMatchVisibility).toBe('LIMITED');
    expect(dashboard.latestMatchLimitedReason).toBe('BLOCKED');
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      result: 'MATCHED',
      visibility: 'LIMITED',
      limitedReason: 'BLOCKED',
      match: {
        id: 'match-1',
        reasons: [],
        participants: [],
      },
    });
  });

  it('converges expired dashboard meetup sessions with a guarded transition and audit log', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const expiredSession = buildDashboardMeetupSession();
    const loadedExpiredSession = buildDashboardMeetupSession({
      status: 'EXPIRED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      expiresAt: null,
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const meetupSessionUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const meetupProposalUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const meetupOptionUpdateMany = jest.fn().mockResolvedValue({ count: 2 });
    const meetupParticipantUpdateMany = jest
      .fn()
      .mockResolvedValue({ count: 2 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const tx = {
      meetupSession: {
        updateMany: meetupSessionUpdateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue(loadedExpiredSession),
      },
      meetupProposal: {
        updateMany: meetupProposalUpdateMany,
      },
      meetupOption: {
        updateMany: meetupOptionUpdateMany,
      },
      meetupParticipant: {
        updateMany: meetupParticipantUpdateMany,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const prisma = {
      ...createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
        dashboardMeetupMatch: {
          id: 'match-1',
          introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
          meetupSession: expiredSession,
        },
      }),
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.meetupSummary?.status).toBe('EXPIRED');
    expect(meetupSessionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'session-1',
        status: 'ACTIVE',
        currentProposalId: 'proposal-1',
        finalConfirmRequiredByUserId: null,
        expiresAt: {
          lte: expect.any(Date) as Date,
        },
      },
      data: expect.objectContaining({
        status: 'EXPIRED',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
      }) as object,
    });
    expect(meetupProposalUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'proposal-1',
        sessionId: 'session-1',
        status: 'PENDING',
      },
      data: {
        status: 'SUPERSEDED',
      },
    });
    expect(meetupParticipantUpdateMany).toHaveBeenCalledWith({
      where: { sessionId: 'session-1' },
      data: {
        turnState: 'NONE',
        responseRequiredAt: null,
        responseRequiredMessageId: null,
      },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'meetup.expired',
        metadata: {
          sessionId: 'session-1',
          matchId: 'match-1',
        },
      },
    });
  });

  it('does not clear dashboard meetup turns or audit when expiry transition loses the race', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const expiredSession = buildDashboardMeetupSession();
    const canceledSession = buildDashboardMeetupSession({
      status: 'CANCELED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
      expiresAt: null,
      canceledAt: new Date('2026-05-14T10:00:00.000Z'),
      canceledByUserId: 'user-2',
      participants: [
        {
          userId: 'user-1',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 1' },
        },
        {
          userId: 'user-2',
          turnState: 'NONE',
          revisionUsedAt: null,
          lastSeenAt: null,
          user: { displayName: 'User 2' },
        },
      ],
    });
    const meetupSessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const meetupProposalUpdateMany = jest.fn();
    const meetupParticipantUpdateMany = jest.fn();
    const auditLogCreate = jest.fn();
    const tx = {
      meetupSession: {
        updateMany: meetupSessionUpdateMany,
        findUniqueOrThrow: jest.fn().mockResolvedValue(canceledSession),
      },
      meetupProposal: {
        updateMany: meetupProposalUpdateMany,
      },
      meetupOption: {
        updateMany: jest.fn(),
      },
      meetupParticipant: {
        updateMany: meetupParticipantUpdateMany,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const prisma = {
      ...createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [{ cycleId: 'cycle-1', status: 'OPTED_IN' }],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
        dashboardMeetupMatch: {
          id: 'match-1',
          introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          participants: [{ userId: 'user-1' }, { userId: 'user-2' }],
          meetupSession: expiredSession,
        },
      }),
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.meetupSummary?.status).toBe('CANCELED');
    expect(meetupSessionUpdateMany).toHaveBeenCalledTimes(1);
    expect(meetupProposalUpdateMany).not.toHaveBeenCalled();
    expect(meetupParticipantUpdateMany).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('treats a missing current-cycle participation as opted out on dashboard load', async () => {
    const cycleParticipation = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-2',
          codename: 'Round 2',
          revealAt: new Date('2026-05-01T12:00:00.000Z'),
          participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          status: 'OPEN',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      cycleParticipation,
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      currentCycle: {
        id: 'cycle-2',
        participationStatus: 'OPTED_OUT',
        intent: null,
      },
    });
  });

  it('exposes the saved weekly intent on the dashboard payload', async () => {
    const cycleParticipation = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({
        status: 'OPTED_IN',
        intent: 'BOTH',
      }),
    };
    const prisma = {
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      questionnaireResponse: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-3',
          codename: 'Round 3',
          revealAt: new Date('2026-05-08T12:00:00.000Z'),
          participationDeadline: new Date('2026-05-07T12:00:00.000Z'),
          createdAt: new Date('2026-04-25T12:00:00.000Z'),
          status: 'OPEN',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      cycleParticipation,
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      currentCycle: {
        id: 'cycle-3',
        participationStatus: 'OPTED_IN',
        intent: 'BOTH',
      },
    });
  });

  it('saves contact preferences with normalized international phone numbers', async () => {
    const userUpdate = jest.fn().mockResolvedValue(undefined);
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const upsert = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([
      {
        type: 'PHONE',
        value: '+8613800138000',
      },
      {
        type: 'WECHAT',
        value: 'wx_user',
      },
    ]);
    const prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user-1@example.com',
          preferredContactChannel: 'EMAIL',
        }),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          user: {
            update: userUpdate,
          },
          userContactMethod: {
            deleteMany,
            upsert,
            findMany,
          },
        }),
      ),
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.updateContactPreferences('user-1', {
        preferredContactChannel: 'PHONE',
        methods: [
          { type: 'PHONE', value: '+86 138 0013 8000' },
          { type: 'WECHAT', value: ' wx_user ' },
        ],
      }),
    ).resolves.toEqual({
      email: 'user-1@example.com',
      preferredContactChannel: 'PHONE',
      methods: [
        { type: 'PHONE', value: '+8613800138000' },
        { type: 'WECHAT', value: 'wx_user' },
      ],
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { preferredContactChannel: 'PHONE' },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        type: {
          in: ['QQ'],
        },
      },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_type: {
          userId: 'user-1',
          type: 'PHONE',
        },
      },
      update: {
        value: '+8613800138000',
        normalizedValue: '+8613800138000',
      },
      create: {
        userId: 'user-1',
        type: 'PHONE',
        value: '+8613800138000',
        normalizedValue: '+8613800138000',
      },
    });
  });

  it('rejects choosing a non-email contact channel that has no value', async () => {
    const service = new AccountService(
      {} as never,
      {} as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.updateContactPreferences('user-1', {
        preferredContactChannel: 'QQ',
        methods: [{ type: 'WECHAT', value: 'wx_user' }],
      }),
    ).rejects.toMatchObject({
      message: 'Selected contact channel must have a value.',
    });
  });

  it('uses each participant selected contact channel when requesting contact', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const queuedEmails = [
      {
        dedupeKey: 'match-introduction:match-1:requester',
        recipientEmail: 'user-1@example.com',
        subject: 'subject-1',
        html: '<p>requester</p>',
      },
      {
        dedupeKey: 'match-introduction:match-1:recipient',
        recipientEmail: 'user-2@example.com',
        subject: 'subject-2',
        html: '<p>recipient</p>',
      },
    ];
    const buildIntroductionEmails: jest.MockedFunction<
      (payload: IntroductionEmailPayload) => typeof queuedEmails
    > = jest.fn().mockReturnValue(queuedEmails);
    const mailService = {
      buildIntroductionEmails,
      flushQueuedEmails: jest.fn().mockResolvedValue(undefined),
    };
    const participantUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      matchParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'participant-1',
          userId: 'user-1',
          match: {
            id: 'match-1',
            revealedAt: new Date('2026-05-08T12:00:00.000Z'),
            introducedAt: null,
            reasons: ['reason'],
            reason: 'reason paragraph',
            conversationTopics: ['topic 1'],
            participants: [
              {
                id: 'participant-1',
                userId: 'user-1',
                user: {
                  email: 'user-1@example.com',
                  displayName: 'User 1',
                  preferredContactChannel: 'WECHAT',
                  contactMethods: [{ type: 'WECHAT', value: 'wx_user_1' }],
                  profile: { headline: 'hello' },
                  school: { name: 'School A' },
                  questionnaireResponse: null,
                },
              },
              {
                id: 'participant-2',
                userId: 'user-2',
                user: {
                  email: 'user-2@example.com',
                  displayName: 'User 2',
                  preferredContactChannel: 'PHONE',
                  contactMethods: [{ type: 'PHONE', value: '+14155552671' }],
                  profile: { headline: 'world' },
                  school: { name: 'School B' },
                  questionnaireResponse: null,
                },
              },
            ],
          },
        }),
      },
      block: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
          block: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
          match: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          matchParticipant: {
            updateMany: participantUpdateMany,
          },
          outboundEmail: {
            createMany,
          },
        }),
      ),
    };
    const service = new AccountService(
      prisma as never,
      mailService as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.requestContact('user-1', 'match-1')).resolves.toEqual({
      ok: true,
    });
    expect(mailService.buildIntroductionEmails).toHaveBeenCalledTimes(1);
    const introductionEmailPayload =
      mailService.buildIntroductionEmails.mock.calls[0][0];
    expect(introductionEmailPayload.requester.publicContact).toEqual({
      type: 'WECHAT',
      label: '微信号',
      value: 'wx_user_1',
    });
    expect(introductionEmailPayload.recipient.publicContact).toEqual({
      type: 'PHONE',
      label: '手机号',
      value: '+14155552671',
    });
    expect(participantUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'participant-1',
        contactRequestedAt: null,
      },
      data: {
        contactRequestedAt: expect.any(Date) as Date,
        introducedContactType: 'WECHAT',
        introducedContactValue: 'wx_user_1',
      },
    });
    expect(participantUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'participant-2',
      },
      data: {
        introducedContactType: 'PHONE',
        introducedContactValue: '+14155552671',
      },
    });
  });

  it('does not introduce a match when a block appears inside the contact request transaction', async () => {
    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const participantUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const mailService = {
      buildIntroductionEmails: jest.fn().mockReturnValue([
        {
          dedupeKey: 'match-introduction:match-1:requester',
          recipientEmail: 'user-1@example.com',
          subject: 'subject-1',
          html: '<p>requester</p>',
        },
      ]),
      flushQueuedEmails: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      matchParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'participant-1',
          userId: 'user-1',
          match: {
            id: 'match-1',
            revealedAt: new Date('2026-05-08T12:00:00.000Z'),
            introducedAt: null,
            reasons: ['reason'],
            reason: 'reason paragraph',
            conversationTopics: ['topic 1'],
            participants: [
              {
                id: 'participant-1',
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
                id: 'participant-2',
                userId: 'user-2',
                user: {
                  email: 'user-2@example.com',
                  displayName: 'User 2',
                  profile: { headline: 'world' },
                  school: { name: 'School B' },
                  questionnaireResponse: null,
                },
              },
            ],
          },
        }),
      },
      block: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
          block: {
            findFirst: jest.fn().mockResolvedValue({
              blockerId: 'user-2',
              blockedId: 'user-1',
            }),
          },
          match: {
            updateMany: matchUpdateMany,
          },
          matchParticipant: {
            updateMany: participantUpdateMany,
          },
          outboundEmail: {
            createMany,
          },
        }),
      ),
    };
    const service = new AccountService(
      prisma as never,
      mailService as never,
      {} as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.requestContact('user-1', 'match-1'),
    ).rejects.toMatchObject({
      message: 'This match is no longer available for introductions.',
    });
    expect(matchUpdateMany).not.toHaveBeenCalled();
    expect(participantUpdateMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(mailService.buildIntroductionEmails).not.toHaveBeenCalled();
    expect(mailService.flushQueuedEmails).not.toHaveBeenCalled();
  });

  it('creates only a one-way block when a match is reported', async () => {
    const reportCreate = jest.fn().mockResolvedValue(undefined);
    const blockUpsert = jest.fn().mockResolvedValue(undefined);
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      matchParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-1',
            userId: 'user-1',
            match: {
              id: 'match-1',
              revealedAt: new Date('2026-05-08T12:00:00.000Z'),
              reasons: ['reason'],
              participants: [
                {
                  userId: 'user-1',
                  user: {
                    email: 'user-1@example.com',
                    displayName: 'User 1',
                    profile: { headline: 'hello' },
                    school: { name: 'School A' },
                  },
                },
                {
                  userId: 'user-2',
                  user: {
                    email: 'user-2@example.com',
                    displayName: 'User 2',
                    profile: { headline: 'world' },
                    school: { name: 'School B' },
                  },
                },
              ],
            },
          })
          .mockResolvedValueOnce({
            id: 'participant-2',
            userId: 'user-2',
            match: {
              id: 'match-1',
              reasons: ['reason'],
            },
          }),
      },
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: reportCreate,
      },
      block: {
        upsert: blockUpsert,
      },
      auditLog: {
        create: auditLogCreate,
      },
      userCycleDashboardSnapshot: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
              report: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: reportCreate,
              },
              block: {
                upsert: blockUpsert,
              },
              auditLog: {
                create: auditLogCreate,
              },
            }),
        ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new AccountService(
      prisma as never,
      {
        buildIntroductionEmails: jest.fn(),
        flushQueuedEmails: jest.fn(),
      } as never,
      {} as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.reportMatch('user-1', 'match-1', { reason: '骚扰' }),
    ).resolves.toEqual({ ok: true });

    expect(reportCreate).toHaveBeenCalledWith({
      data: {
        reporterId: 'user-1',
        reportedUserId: 'user-2',
        matchId: 'match-1',
        reason: '骚扰',
        details: undefined,
        createdBlock: true,
      },
    });
    expect(blockUpsert).toHaveBeenCalledTimes(1);
    expect(blockUpsert).toHaveBeenCalledWith({
      where: {
        blockerId_blockedId: {
          blockerId: 'user-1',
          blockedId: 'user-2',
        },
      },
      update: {},
      create: {
        blockerId: 'user-1',
        blockedId: 'user-2',
      },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'match.reported',
        metadata: {
          matchId: 'match-1',
          reportedUserId: 'user-2',
          reason: '骚扰',
        },
      },
    });
    expect(dashboardSnapshotService.syncMatchSnapshots).toHaveBeenCalledWith(
      'match-1',
      expect.objectContaining<{
        report: unknown;
        block: unknown;
        auditLog: unknown;
      }>({
        report: expect.objectContaining({ create: reportCreate }),
        block: expect.objectContaining({ upsert: blockUpsert }),
        auditLog: expect.objectContaining({ create: auditLogCreate }),
      }),
    );
  });

  it('rechecks an open report after locking the match row', async () => {
    const reportCreate = jest.fn().mockResolvedValue(undefined);
    const transactionReportFindFirst = jest
      .fn()
      .mockResolvedValue({ id: 'report-1' });
    const prisma = {
      matchParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'participant-1',
            userId: 'user-1',
            match: {
              id: 'match-1',
              revealedAt: new Date('2026-05-08T12:00:00.000Z'),
            },
          })
          .mockResolvedValueOnce({
            id: 'participant-2',
            userId: 'user-2',
          }),
      },
      report: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: reportCreate,
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: unknown) => Promise<unknown>) =>
            callback({
              $queryRaw: jest.fn().mockResolvedValue([{ id: 'match-1' }]),
              report: {
                findFirst: transactionReportFindFirst,
                create: reportCreate,
              },
              block: {
                upsert: jest.fn().mockResolvedValue(undefined),
              },
              auditLog: {
                create: jest.fn().mockResolvedValue(undefined),
              },
            }),
        ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = new AccountService(
      prisma as never,
      {
        buildIntroductionEmails: jest.fn(),
        flushQueuedEmails: jest.fn(),
      } as never,
      {} as never,
      dashboardSnapshotService as never,
    );

    await expect(
      service.reportMatch('user-1', 'match-1', { reason: 'spam' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transactionReportFindFirst).toHaveBeenCalledWith({
      where: {
        reporterId: 'user-1',
        matchId: 'match-1',
        status: 'OPEN',
      },
    });
    expect(reportCreate).not.toHaveBeenCalled();
    expect(dashboardSnapshotService.syncMatchSnapshots).not.toHaveBeenCalled();
  });
});
