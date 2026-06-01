import { BadRequestException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { QuestionType } from '../../common/prisma/client';
import { DashboardSnapshotModule } from '../../common/dashboard/dashboard-snapshot.module';
import { CyclesService } from './cycles.service';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';
import { CyclesModule } from './cycles.module';

type EligibleParticipantStub = {
  id: string;
  displayName: string | null;
  questionnaireVersionId?: string | null;
  hardMatchAnswers: {
    birthDate: string;
    partnerAgeMin: number;
    partnerAgeMax: number;
    gender: string;
    partnerGenders: string[];
    looks: string;
    partnerLooks: string[];
    heightCm: number;
    partnerHeightMin: number;
    partnerHeightMax: number;
    oneLinerIntro: string;
    school: string;
    excludedPartnerSchools: string[];
    excludedPartnerSchoolGenders?: Array<{
      schoolId: string;
      genders: string[];
    }>;
  };
  answers: Record<string, unknown>;
  intent: 'FRIEND' | 'DATE' | 'BOTH';
};

type CandidatePairStub = {
  left: { id: string };
  right: { id: string };
  score: number;
};

type CyclesServiceTestHarness = {
  scorePair: (
    left: EligibleParticipantStub,
    right: EligibleParticipantStub,
    questions: Array<{
      key: string;
      prompt: string;
      type: QuestionType;
      weight: number;
      selectionLimit?: number | null;
      options: Array<{ value: string; label: string }>;
    }>,
    revealAt: Date,
  ) => {
    score: number;
  } | null;
  calculatePairRawScore: (
    left: EligibleParticipantStub,
    right: EligibleParticipantStub,
    questions: Array<{
      key: string;
      prompt: string;
      type: QuestionType;
      weight: number;
      selectionLimit?: number | null;
      options: Array<{ value: string; label: string }>;
    }>,
    revealAt: Date,
  ) => {
    rawScore: number;
    scoreBounds: { min: number; max: number };
  } | null;
  normalizeMatchScore: (
    rawScore: number,
    scoreBounds: { min: number; max: number },
  ) => number;
  calculateRawScoreForTest: (
    left: EligibleParticipantStub,
    right: EligibleParticipantStub,
    questions: Array<{
      key: string;
      prompt: string;
      type: QuestionType;
      weight: number;
      selectionLimit?: number | null;
      options: Array<{ value: string; label: string }>;
    }>,
    revealAt: Date,
  ) => {
    rawScore: number;
    score: number;
  } | null;
  toEligibleParticipants: (
    participations: unknown[],
  ) => EligibleParticipantStub[];
  calculatePairs: (
    participants: EligibleParticipantStub[],
    questions: unknown[],
    revealAt: Date,
    currentCycleId?: string,
    questionnairesByVersionId?: Map<string, unknown[]>,
  ) => Promise<{
    candidates: CandidatePairStub[];
    selectedPairs: CandidatePairStub[];
  }>;
};

const SCHOOL_BUPT = 'school-bupt';
const SCHOOL_CUC = 'school-cuc';

function createBroadParticipant(
  id: string,
  answers: Record<string, unknown>,
  intent: 'FRIEND' | 'DATE' | 'BOTH' = 'BOTH',
): EligibleParticipantStub {
  return {
    id,
    displayName: id,
    hardMatchAnswers: {
      birthDate: '2000-05-10',
      partnerAgeMin: 18,
      partnerAgeMax: 40,
      gender: '非二元',
      partnerGenders: ['男', '女', '非二元'],
      looks: '普通人',
      partnerLooks: ['普通人', '小帅/美', '顶帅/美'],
      heightCm: 170,
      partnerHeightMin: 120,
      partnerHeightMax: 220,
      oneLinerIntro: '喜欢社交与电影。',
      school: SCHOOL_BUPT,
      excludedPartnerSchools: [],
    },
    answers,
    intent,
  };
}

function createPairCalculationPrisma(input?: {
  blocks?: unknown[];
  historicalMatches?: unknown[];
  historicalParticipations?: unknown[];
  matchedParticipations?: unknown[];
}) {
  return {
    block: {
      findMany: jest.fn().mockResolvedValue(input?.blocks ?? []),
    },
    match: {
      findMany: jest.fn().mockResolvedValue(input?.historicalMatches ?? []),
    },
    cycleParticipation: {
      findMany: jest
        .fn()
        .mockResolvedValue(input?.historicalParticipations ?? []),
    },
    matchParticipant: {
      findMany: jest.fn().mockResolvedValue(input?.matchedParticipations ?? []),
    },
  };
}

function createHistoricalParticipation(
  userId: string,
  cycleId: string,
  revealAt: string,
) {
  const revealedAt = new Date(revealAt);

  return {
    userId,
    cycleId,
    updatedAt: revealedAt,
    cycle: {
      revealAt: revealedAt,
      createdAt: revealedAt,
    },
  };
}

const RELATIONSHIP_QUESTION = {
  key: 'relationship_intent',
  prompt: 'Intent',
  type: QuestionType.SINGLE_SELECT,
  weight: 3,
  options: [
    { value: 'serious', label: '认真稳定的关系' },
    { value: 'slow', label: '先认真了解再决定' },
  ],
};

const VALUE_QUESTION = {
  key: 'values',
  prompt: 'Values',
  type: QuestionType.MULTI_SELECT,
  weight: 2,
  options: [
    { value: 'honesty', label: '真诚' },
    { value: 'stability', label: '稳定' },
    { value: 'humor', label: '幽默感' },
    { value: 'growth', label: '上进' },
  ],
};

const SCALE_QUESTION = {
  key: 'openness',
  prompt: 'Openness',
  type: QuestionType.SCALE,
  weight: 2,
  options: [
    { value: 'very_unlike', label: '非常不像我' },
    { value: 'unlike', label: '比较不像我' },
    { value: 'depends', label: '看情况' },
    { value: 'like', label: '比较像我' },
    { value: 'very_like', label: '非常像我' },
  ],
};

function createDashboardSnapshotServiceMock() {
  return {
    syncCycleSnapshots: jest.fn().mockResolvedValue(undefined),
  };
}

function createCyclesService(
  prisma: unknown,
  dashboardSnapshotService = createDashboardSnapshotServiceMock(),
) {
  return new CyclesService(prisma as never, dashboardSnapshotService as never);
}

function bindRawScorePairForTest(service: CyclesService) {
  const harness = service as unknown as Pick<
    CyclesServiceTestHarness,
    'calculatePairRawScore' | 'normalizeMatchScore'
  >;
  const calculatePairRawScore = harness.calculatePairRawScore.bind(service);
  const normalizeMatchScore = harness.normalizeMatchScore.bind(service);

  return (
    ...args: Parameters<CyclesServiceTestHarness['calculatePairRawScore']>
  ) => {
    const scored = calculatePairRawScore(...args);
    if (!scored) {
      return null;
    }

    return {
      rawScore: scored.rawScore,
      score: normalizeMatchScore(scored.rawScore, scored.scoreBounds),
    };
  };
}

const MOCK_RAW_SCORE_BOUNDS = { min: 70, max: 100 };

describe('CyclesService', () => {
  afterEach(() => {
    clearStickyParticipationCache();
  });

  it('declares dashboard snapshot sync as a module dependency', () => {
    const imports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CyclesModule,
    );

    expect(Array.isArray(imports)).toBe(true);
    expect(imports).toContain(DashboardSnapshotModule);
  });

  it('rejects preparing a cycle before participation deadline by default', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() + 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ cycleParticipation })),
      ),
    };
    const service = createCyclesService(prisma);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows an explicit force run before participation deadline', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const revealClaim = jest.fn().mockResolvedValue({ count: 1 });
    const revealMatchUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const revealTx = {
      cycleParticipation,
      match: {
        updateMany: revealMatchUpdateMany,
      },
      matchCycle: {
        update: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
        updateMany: revealClaim,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const prisma = {
      matchCycle: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() + 60_000),
            revealAt: new Date(Date.now() + 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date('2026-04-20T12:00:00.000Z'),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() + 60_000),
            revealAt: new Date(Date.now() + 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date('2026-04-20T12:00:00.000Z'),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'REVEAL_READY',
            revealAt: new Date(Date.now() + 60_000),
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(revealTx)),
      ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = createCyclesService(prisma, dashboardSnapshotService);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1', force: true }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'REVEALED',
      createdMatches: 0,
    });
    // Snapshots are rebuilt outside the reveal transaction (no tx client), so
    // the reveal's status/match updates commit before the per-participation
    // rebuild runs.
    expect(dashboardSnapshotService.syncCycleSnapshots).toHaveBeenCalledWith(
      'cycle-1',
    );
  });

  it('does not sync dashboard snapshots when reveal claim is lost', async () => {
    const revealClaim = jest.fn().mockResolvedValue({ count: 0 });
    const revealMatchUpdateMany = jest.fn();
    const auditLogCreate = jest.fn();
    const revealTx = {
      match: {
        updateMany: revealMatchUpdateMany,
      },
      matchCycle: {
        updateMany: revealClaim,
      },
      auditLog: {
        create: auditLogCreate,
      },
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'REVEAL_READY',
          revealAt: new Date(Date.now() - 60_000),
        }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn(revealTx)),
      ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = createCyclesService(prisma, dashboardSnapshotService);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'SKIPPED',
      createdMatches: 0,
    });
    expect(revealMatchUpdateMany).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(dashboardSnapshotService.syncCycleSnapshots).not.toHaveBeenCalled();
  });

  it('backfills sticky participation records before running an existing open cycle', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const recentActiveAt = new Date();
    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const claimReveal = jest.fn().mockResolvedValue({ count: 1 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const revealMatchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const matchCycleUpdate = jest.fn().mockResolvedValue({ id: 'cycle-1' });
    const cycleParticipation = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            userId: 'user-1',
            status: 'OPTED_IN',
            intent: 'FRIEND',
            updatedAt: new Date('2026-04-10T12:00:00.000Z'),
            user: {
              lastActiveAt: recentActiveAt,
              questionnaireResponse: {
                submittedAt: new Date('2026-03-15T00:00:00.000Z'),
              },
            },
          },
          {
            userId: 'user-2',
            status: 'OPTED_IN',
            intent: 'DATE',
            updatedAt: new Date('2026-04-11T12:00:00.000Z'),
            user: {
              lastActiveAt: recentActiveAt,
              questionnaireResponse: {
                submittedAt: new Date('2026-03-16T00:00:00.000Z'),
              },
            },
          },
        ]),
      createMany,
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() - 60_000),
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() - 60_000),
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() - 60_000),
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [
              {
                user: {
                  id: 'user-1',
                  displayName: 'A',
                  questionnaireResponse: { answers: {} },
                },
              },
              {
                user: {
                  id: 'user-2',
                  displayName: 'B',
                  questionnaireResponse: { answers: {} },
                },
              },
            ],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'REVEAL_READY',
            revealAt: new Date(Date.now() - 60_000),
          }),
        updateMany: claimPreparation,
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      match: {
        count: jest.fn().mockResolvedValue(0),
      },
      cycleParticipation,
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              create: matchCreate,
              updateMany: revealMatchUpdateMany,
            },
            matchCycle: {
              update: matchCycleUpdate,
              updateMany: claimReveal,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const service = new CyclesService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;
    jest.spyOn(testHarness, 'toEligibleParticipants').mockReturnValue([
      {
        id: 'user-1',
        displayName: 'A',
        hardMatchAnswers: {
          birthDate: '2000-05-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 165,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢徒步。',
          school: SCHOOL_BUPT,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
      {
        id: 'user-2',
        displayName: 'B',
        hardMatchAnswers: {
          birthDate: '1999-07-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '男',
          partnerGenders: ['女'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 178,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢阅读。',
          school: SCHOOL_CUC,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
    ]);
    jest.spyOn(testHarness, 'calculatePairs').mockResolvedValue({
      candidates: [],
      selectedPairs: [
        {
          left: { id: 'user-1' },
          right: { id: 'user-2' },
          score: 88,
        },
      ],
    });

    await expect(
      service.runRevealCycle({ force: true, cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
    });

    const createManyCalls = createMany.mock.calls as Array<
      [
        {
          data: Array<{
            cycleId: string;
            userId: string;
            status: 'OPTED_IN' | 'OPTED_OUT';
            intent: 'FRIEND' | 'DATE' | 'BOTH' | null;
            optedInAt: Date | null;
          }>;
          skipDuplicates: boolean;
        },
      ]
    >;
    const createManyArgument = createManyCalls[0]?.[0];

    if (!createManyArgument) {
      throw new Error('Expected createMany to be called.');
    }

    expect(createManyArgument.skipDuplicates).toBe(true);
    // Sticky carry-over preserves the latest stored intent for OPTED_IN users.
    expect(createManyArgument.data).toEqual([
      {
        cycleId: 'cycle-1',
        userId: 'user-1',
        status: 'OPTED_IN',
        intent: 'FRIEND',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-1',
        userId: 'user-2',
        status: 'OPTED_IN',
        intent: 'DATE',
        optedInAt: createManyArgument.data[1]?.optedInAt ?? null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
    expect(createManyArgument.data[1]?.optedInAt).toBeInstanceOf(Date);
    expect(claimPreparation).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'OPEN',
      },
      data: {
        status: 'PREPARING',
        updatedAt: expect.any(Date) as Date,
      },
    });
    expect(matchCreate).toHaveBeenCalledTimes(1);
    const auditLogCalls = auditLogCreate.mock.calls as Array<
      [
        {
          data: {
            action: string;
          };
        },
      ]
    >;
    const preparedAuditCall = auditLogCalls.find(
      ([call]) => call.data.action === 'cycle.prepared',
    );
    expect(preparedAuditCall).toBeDefined();
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        adminActorId: undefined,
        action: 'cycle.revealed',
        metadata: {
          cycleId: 'cycle-1',
          createdMatches: 1,
          forced: true,
        },
      },
    });
  });

  it('previews cycles without backfilling sticky participation rows', async () => {
    const matchCycleFindUnique = jest.fn().mockResolvedValue({
      id: 'cycle-1',
      status: 'OPEN',
      revealAt: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      participations: [],
    });
    const prisma = {
      matchCycle: {
        findUnique: matchCycleFindUnique,
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
    };
    const service = createCyclesService(prisma);

    await expect(service.previewCycle('cycle-1')).resolves.toMatchObject({
      cycleId: 'cycle-1',
      candidates: [],
      suggestedPairs: [],
      unmatchedUserIds: [],
    });
    expect(matchCycleFindUnique).toHaveBeenCalledTimes(1);
  });

  it('injects the current school id when building eligible participants', () => {
    const service = createCyclesService({});
    const toEligibleParticipants = (
      service as unknown as Pick<
        CyclesServiceTestHarness,
        'toEligibleParticipants'
      >
    ).toEligibleParticipants.bind(service);

    const participants = toEligibleParticipants([
      {
        intent: 'BOTH',
        user: {
          id: 'user-1',
          displayName: 'A',
          school: { id: SCHOOL_BUPT },
          questionnaireResponse: {
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            answers: {
              hard_birth_date: '2000-05-10',
              hard_partner_age_min: 18,
              hard_partner_age_max: 30,
              hard_gender: '女',
              hard_partner_genders: ['男'],
              hard_looks: '普通人',
              hard_partner_looks: ['普通人'],
              hard_height_cm: 165,
              hard_partner_height_min: 120,
              hard_partner_height_max: 220,
              hard_one_liner_intro: '喜欢徒步。',
              hard_excluded_partner_schools: [SCHOOL_CUC],
            },
          },
        },
      },
      {
        intent: 'FRIEND',
        user: {
          id: 'user-2',
          displayName: 'B',
          school: null,
          questionnaireResponse: {
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            answers: {
              hard_birth_date: '1999-07-10',
              hard_partner_age_min: 18,
              hard_partner_age_max: 30,
              hard_gender: '男',
              hard_partner_genders: ['女'],
              hard_looks: '普通人',
              hard_partner_looks: ['普通人'],
              hard_height_cm: 178,
              hard_partner_height_min: 120,
              hard_partner_height_max: 220,
              hard_one_liner_intro: '喜欢阅读。',
            },
          },
        },
      },
    ]);

    expect(participants).toHaveLength(1);
    expect(participants[0]).toMatchObject({
      id: 'user-1',
      hardMatchAnswers: {
        school: SCHOOL_BUPT,
        excludedPartnerSchools: [SCHOOL_CUC],
      },
      answers: {
        hard_school: SCHOOL_BUPT,
        hard_excluded_partner_schools: [SCHOOL_CUC],
      },
      intent: 'BOTH',
    });
  });

  it('ignores questionnaire drafts that were never formally submitted', () => {
    const service = createCyclesService({});
    const toEligibleParticipants = (
      service as unknown as Pick<
        CyclesServiceTestHarness,
        'toEligibleParticipants'
      >
    ).toEligibleParticipants.bind(service);

    const participants = toEligibleParticipants([
      {
        intent: 'BOTH',
        user: {
          id: 'user-1',
          displayName: 'A',
          school: { id: SCHOOL_BUPT },
          questionnaireResponse: {
            submittedAt: null,
            answers: {
              hard_birth_date: '2000-05-10',
              hard_partner_age_min: 18,
              hard_partner_age_max: 30,
              hard_gender: '女',
              hard_partner_genders: ['男'],
              hard_looks: '普通人',
              hard_partner_looks: ['普通人'],
              hard_height_cm: 165,
              hard_partner_height_min: 120,
              hard_partner_height_max: 220,
              hard_one_liner_intro: '喜欢徒步。',
            },
          },
        },
      },
    ]);

    expect(participants).toEqual([]);
  });

  it('drops participants whose weekly intent is missing or invalid', () => {
    const service = createCyclesService({});
    const toEligibleParticipants = (
      service as unknown as Pick<
        CyclesServiceTestHarness,
        'toEligibleParticipants'
      >
    ).toEligibleParticipants.bind(service);

    const validQuestionnaireAnswers = {
      hard_birth_date: '2000-05-10',
      hard_partner_age_min: 18,
      hard_partner_age_max: 30,
      hard_gender: '女',
      hard_partner_genders: ['男'],
      hard_looks: '普通人',
      hard_partner_looks: ['普通人'],
      hard_height_cm: 165,
      hard_partner_height_min: 120,
      hard_partner_height_max: 220,
      hard_one_liner_intro: '喜欢徒步。',
      hard_excluded_partner_schools: [],
    };

    const participants = toEligibleParticipants([
      {
        intent: null,
        user: {
          id: 'user-no-intent',
          displayName: 'NoIntent',
          school: { id: SCHOOL_BUPT },
          questionnaireResponse: {
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            answers: validQuestionnaireAnswers,
          },
        },
      },
      {
        intent: 'GHOST',
        user: {
          id: 'user-bad-intent',
          displayName: 'BadIntent',
          school: { id: SCHOOL_BUPT },
          questionnaireResponse: {
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            answers: validQuestionnaireAnswers,
          },
        },
      },
      {
        intent: 'DATE',
        user: {
          id: 'user-good',
          displayName: 'Good',
          school: { id: SCHOOL_BUPT },
          questionnaireResponse: {
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
            answers: validQuestionnaireAnswers,
          },
        },
      },
    ]);

    expect(participants.map((participant) => participant.id)).toEqual([
      'user-good',
    ]);
    expect(participants[0]?.intent).toBe('DATE');
  });

  it('blocks pairing when weekly intents are incompatible (FRIEND vs DATE)', () => {
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);

    const friendOnly = createBroadParticipant('user-friend', {}, 'FRIEND');
    const dateOnly = createBroadParticipant('user-date', {}, 'DATE');
    const bridge = createBroadParticipant('user-both', {}, 'BOTH');

    expect(
      scorePair(friendOnly, dateOnly, [], new Date('2026-04-10T00:00:00.000Z')),
    ).toBeNull();

    expect(
      scorePair(friendOnly, bridge, [], new Date('2026-04-10T00:00:00.000Z')),
    ).not.toBeNull();
    expect(
      scorePair(dateOnly, bridge, [], new Date('2026-04-10T00:00:00.000Z')),
    ).not.toBeNull();
    expect(
      scorePair(
        friendOnly,
        friendOnly,
        [],
        new Date('2026-04-10T00:00:00.000Z'),
      ),
    ).not.toBeNull();
  });

  it('treats partnerAge window as a soft preference and still scores misread relative ranges', () => {
    // Real production case: users mis-read "希望对方年龄" as a relative
    // offset and entered partnerAgeMin/Max=4..5 meaning "对方比我小 4-5
    // 岁". With age as a hard filter the pair was dropped; soft scoring
    // keeps it in the candidate set instead.
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);

    const left = createBroadParticipant('age-soft-left', {});
    const rightWithMisreadWindow = createBroadParticipant('age-soft-right', {});
    rightWithMisreadWindow.hardMatchAnswers = {
      ...rightWithMisreadWindow.hardMatchAnswers,
      partnerAgeMin: 4,
      partnerAgeMax: 5,
    };

    expect(
      scorePair(
        left,
        rightWithMisreadWindow,
        [],
        new Date('2026-04-10T00:00:00.000Z'),
      ),
    ).not.toBeNull();
  });

  it('scores pairs whose ages fall inside the partner window higher than pairs that fall fully outside', () => {
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);
    const revealAt = new Date('2026-04-10T00:00:00.000Z');

    const inside = createBroadParticipant('age-inside', {});
    const insideRight = createBroadParticipant('age-inside-right', {});
    const outsideRight = createBroadParticipant('age-outside-right', {});
    outsideRight.hardMatchAnswers = {
      ...outsideRight.hardMatchAnswers,
      partnerAgeMin: 4,
      partnerAgeMax: 5,
    };

    const insideScore = scorePair(inside, insideRight, [], revealAt);
    const outsideScore = scorePair(inside, outsideRight, [], revealAt);

    expect(insideScore).not.toBeNull();
    expect(outsideScore).not.toBeNull();
    expect(insideScore!.rawScore).toBeGreaterThan(outsideScore!.rawScore);
  });

  it('decays the age preference score linearly per year missed on each side of the partner window', () => {
    // createBroadParticipant pegs everyone to birthDate=2000-05-10. With
    // revealAt=2026-04-10 the partner is 25 years old (May birthday hasn't
    // landed yet). Each side contributes 0..1 to the age fit:
    //   inside the partner window         -> 1
    //   1 year outside the partner window -> 0.75
    //   2 years outside                   -> 0.50
    //   ... (decay 0.25 per year, floors at 0)
    // Average × AGE_PREFERENCE_SOFT_BONUS (=6) is added to rawScore.
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);
    const revealAt = new Date('2026-04-10T00:00:00.000Z');

    const me = createBroadParticipant('age-decay-me', {});

    // Right wants partner aged 30-32; me=25 misses by 5 years -> right side
    // fit=0. Right is 25 and falls inside my 18-40 window -> my side fit=1.
    // Average=0.5, bonus=3.
    const partialMissRight = createBroadParticipant('age-decay-partial', {});
    partialMissRight.hardMatchAnswers = {
      ...partialMissRight.hardMatchAnswers,
      partnerAgeMin: 30,
      partnerAgeMax: 32,
    };

    // Right wants 30-32 AND right is 22 (born 2003-05-10 -> turns 23 next
    // month; on revealAt they are 22). 22 is 18-40, so my side fit=1; my
    // window 18-40 includes 22, but their window 30-32 misses my 25 by 5
    // years -> their side fit=0. Wait, this is the same as partialMiss.
    // Use a stricter setup: my window 30-32 too -> both miss. Both fits=0.
    const fullMissLeft = createBroadParticipant('age-decay-full-left', {});
    fullMissLeft.hardMatchAnswers = {
      ...fullMissLeft.hardMatchAnswers,
      partnerAgeMin: 30,
      partnerAgeMax: 32,
    };
    const fullMissRight = createBroadParticipant('age-decay-full-right', {});
    fullMissRight.hardMatchAnswers = {
      ...fullMissRight.hardMatchAnswers,
      partnerAgeMin: 30,
      partnerAgeMax: 32,
    };

    const inside = scorePair(
      me,
      createBroadParticipant('age-decay-inside-right', {}),
      [],
      revealAt,
    );
    const partial = scorePair(me, partialMissRight, [], revealAt);
    const full = scorePair(fullMissLeft, fullMissRight, [], revealAt);

    expect(inside).not.toBeNull();
    expect(partial).not.toBeNull();
    expect(full).not.toBeNull();

    // Inside vs full-miss: 6-point gap.
    expect(inside!.rawScore - full!.rawScore).toBeCloseTo(6, 5);
    // Partial sits exactly at the half-way point.
    expect(inside!.rawScore - partial!.rawScore).toBeCloseTo(3, 5);
  });

  it('normalizes multi-select scoring so broad selections are not rewarded', () => {
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);

    const focusedMatch = scorePair(
      createBroadParticipant('user-1', {
        values: ['honesty'],
      }),
      createBroadParticipant('user-2', {
        values: ['honesty'],
      }),
      [VALUE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );
    const broadMatch = scorePair(
      createBroadParticipant('user-1', {
        values: ['honesty', 'stability', 'humor', 'growth'],
      }),
      createBroadParticipant('user-2', {
        values: ['honesty'],
      }),
      [VALUE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(focusedMatch).toMatchObject({
      rawScore: 63,
      score: 100,
    });
    expect(broadMatch).toMatchObject({
      rawScore: 58.5,
      score: 91,
    });
  });

  it('gives adjacent scale answers partial credit', () => {
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);

    const adjacentMatch = scorePair(
      createBroadParticipant('user-1', {
        openness: 'like',
      }),
      createBroadParticipant('user-2', {
        openness: 'very_like',
      }),
      [SCALE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );
    const oppositeMatch = scorePair(
      createBroadParticipant('user-1', {
        openness: 'very_unlike',
      }),
      createBroadParticipant('user-2', {
        openness: 'very_like',
      }),
      [SCALE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(adjacentMatch).toMatchObject({
      rawScore: 66,
      score: 95.7,
    });
    expect(oppositeMatch).toMatchObject({
      rawScore: 57,
      score: 82.9,
    });
  });

  it('keeps looks preferences out of hard filtering', () => {
    const service = createCyclesService({});
    const scorePair = bindRawScorePairForTest(service);

    const left = createBroadParticipant('user-1', {});
    const right = createBroadParticipant('user-2', {});
    left.hardMatchAnswers.looks = '普通人';
    left.hardMatchAnswers.partnerLooks = ['普通人'];
    right.hardMatchAnswers.looks = '顶帅/美';
    right.hardMatchAnswers.partnerLooks = ['顶帅/美'];

    expect(
      scorePair(left, right, [], new Date('2026-04-10T00:00:00.000Z')),
    ).toMatchObject({
      rawScore: 54,
      score: 90,
    });
  });

  it('scores stored answers with their submitted questionnaire version and global bounds', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const currentValueQuestion = {
      ...VALUE_QUESTION,
      selectionLimit: 2,
    };
    const oldValueQuestion = {
      ...VALUE_QUESTION,
      description: null,
      selectionLimit: null,
      normalizedOptions: VALUE_QUESTION.options,
    };
    const participants = [
      {
        ...createBroadParticipant('user-1', {
          values: ['honesty', 'stability', 'humor'],
        }),
        questionnaireVersionId: 'version-old',
      },
      {
        ...createBroadParticipant('user-2', {
          values: ['honesty', 'stability', 'humor'],
        }),
        questionnaireVersionId: 'version-old',
      },
    ];

    const result = await calculatePairs(
      participants,
      [currentValueQuestion, RELATIONSHIP_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
      undefined,
      new Map([['version-old', [oldValueQuestion]]]),
    );

    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-1' },
      right: { id: 'user-2' },
      score: 83.6,
    });
  });

  it('does not write a prepared audit when the final preparation claim is lost', async () => {
    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const finalizePreparationClaim = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany: claimPreparation,
        update: jest.fn(),
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              create: matchCreate,
              updateMany: matchUpdateMany,
            },
            matchCycle: {
              updateMany: finalizePreparationClaim,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const service = createCyclesService(prisma);
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;

    jest.spyOn(testHarness, 'toEligibleParticipants').mockReturnValue([
      {
        id: 'user-1',
        displayName: 'A',
        hardMatchAnswers: {
          birthDate: '2000-05-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 165,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢徒步。',
          school: SCHOOL_BUPT,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
      {
        id: 'user-2',
        displayName: 'B',
        hardMatchAnswers: {
          birthDate: '1999-07-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '男',
          partnerGenders: ['女'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 178,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢阅读。',
          school: SCHOOL_CUC,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
    ]);
    jest.spyOn(testHarness, 'calculatePairs').mockResolvedValue({
      candidates: [],
      selectedPairs: [
        {
          left: { id: 'user-1' },
          right: { id: 'user-2' },
          score: 88,
        },
      ],
    });

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PREPARED',
      createdMatches: 1,
      message: 'Cycle is already prepared and waiting for reveal.',
    });

    expect(finalizePreparationClaim).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as Date,
      },
      data: {
        status: 'REVEAL_READY',
      },
    });
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('reverts an empty preparation claim when pair calculation fails', async () => {
    const matchCycleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany: matchCycleUpdateMany,
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({ cycleParticipation }),
      ),
    };
    const service = new CyclesService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;
    jest
      .spyOn(testHarness, 'toEligibleParticipants')
      .mockReturnValue([
        createBroadParticipant('user-1', {}),
        createBroadParticipant('user-2', {}),
      ]);
    jest
      .spyOn(testHarness, 'calculatePairs')
      .mockRejectedValue(new BadRequestException('Invalid score config.'));

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(matchCycleUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'cycle-1',
        status: 'OPEN',
      },
      data: {
        status: 'PREPARING',
        updatedAt: expect.any(Date) as Date,
      },
    });
    expect(matchCycleUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        matches: { none: {} },
        updatedAt: expect.any(Date) as Date,
      },
      data: {
        status: 'OPEN',
      },
    });
  });

  it('does not create matches after the preparation claim is lost', async () => {
    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const activePreparationClaim = jest.fn().mockResolvedValue({ count: 0 });
    const matchCreate = jest.fn();
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany: claimPreparation,
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              create: matchCreate,
            },
            matchCycle: {
              updateMany: activePreparationClaim,
            },
          }),
      ),
    };
    const service = new CyclesService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;
    jest
      .spyOn(testHarness, 'toEligibleParticipants')
      .mockReturnValue([
        createBroadParticipant('user-1', {}),
        createBroadParticipant('user-2', {}),
      ]);
    jest.spyOn(testHarness, 'calculatePairs').mockResolvedValue({
      candidates: [],
      selectedPairs: [
        {
          left: { id: 'user-1' },
          right: { id: 'user-2' },
          score: 88,
        },
      ],
    });

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'SKIPPED',
      message: 'Cycle state changed before preparation finished.',
    });

    expect(activePreparationClaim).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as Date,
      },
      data: {
        updatedAt: expect.any(Date) as Date,
      },
    });
    expect(matchCreate).not.toHaveBeenCalled();
    expect(claimPreparation).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        matches: { none: {} },
        updatedAt: expect.any(Date) as Date,
      },
      data: {
        status: 'OPEN',
      },
    });
  });

  it('keeps waiting when a fresh PREPARING cycle has not persisted matches yet', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date(Date.now() - 60_000),
          participations: [],
        }),
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn(),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
          }),
      ),
    };
    const service = new CyclesService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PENDING',
      createdMatches: 0,
      message: 'Cycle is still being prepared.',
    });

    expect(prisma.match.count).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
  });

  it('recovers stale empty PREPARING cycles and reruns preparation', async () => {
    const staleUpdatedAt = new Date(Date.now() - 11 * 60_000);
    const recoveredPreparationResult = {
      ok: true as const,
      cycleId: 'cycle-1',
      state: 'PREPARED' as const,
      createdMatches: 1,
      unmatchedCount: 0,
      message: 'Cycle is prepared and waiting for reveal.',
    };
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const resetStalePreparation = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: staleUpdatedAt,
          participations: [],
        }),
        updateMany: resetStalePreparation,
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CyclesService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );
    const prepareCycleSpy = jest
      .spyOn(service as never, 'prepareCycle')
      .mockResolvedValue(recoveredPreparationResult as never);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toEqual(recoveredPreparationResult);

    expect(resetStalePreparation).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: staleUpdatedAt,
      },
      data: {
        status: 'OPEN',
      },
    });
    expect(prepareCycleSpy).toHaveBeenCalledWith({
      cycleId: 'cycle-1',
      force: undefined,
      adminActorId: undefined,
    });
  });

  it('logs per-cycle automation failures instead of swallowing them silently', async () => {
    const prisma = {
      matchCycle: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'cycle-open' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
    };
    const service = createCyclesService(prisma);
    const loggerSpy = jest
      .spyOn(
        (
          service as unknown as {
            logger: { error: (message: string) => void };
          }
        ).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    jest
      .spyOn(
        service as unknown as { prepareCycle: () => Promise<unknown> },
        'prepareCycle',
      )
      .mockRejectedValue(new Error('boom'));

    await expect(service.runAutomationTick()).resolves.toEqual({
      ok: true,
      preparedCycleIds: [],
      revealedCycleIds: [],
    });

    expect(loggerSpy).toHaveBeenCalledWith(
      'Cycle automation prepare failed for cycle cycle-open. boom',
    );
  });

  it('clears prior matches before a force rerun', async () => {
    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const claimReveal = jest.fn().mockResolvedValue({ count: 1 });
    const matchDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const snapshotDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const revealMatchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const matchCycleUpdate = jest.fn().mockResolvedValue({ id: 'cycle-1' });
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'REVEALED',
            participationDeadline: new Date(Date.now() - 2 * 60_000),
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
            participationDeadline: new Date(Date.now() - 2 * 60_000),
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'REVEAL_READY',
            revealAt: new Date(Date.now() - 60_000),
          }),
        updateMany: claimPreparation,
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      cycleParticipation,
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      match: {
        deleteMany: matchDeleteMany,
        create: matchCreate,
      },
      userCycleDashboardSnapshot: {
        deleteMany: snapshotDeleteMany,
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }

        const callback = input as (tx: unknown) => Promise<unknown>;
        return callback({
          cycleParticipation,
          match: {
            deleteMany: matchDeleteMany,
            create: matchCreate,
            updateMany: revealMatchUpdateMany,
          },
          matchCycle: {
            update: matchCycleUpdate,
            updateMany: claimReveal,
          },
          auditLog: {
            create: auditLogCreate,
          },
        });
      }),
    };
    const service = createCyclesService(prisma);
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;
    jest.spyOn(testHarness, 'toEligibleParticipants').mockReturnValue([
      {
        id: 'user-1',
        displayName: 'A',
        hardMatchAnswers: {
          birthDate: '2000-05-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '女',
          partnerGenders: ['男'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 170,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢徒步。',
          school: SCHOOL_BUPT,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
      {
        id: 'user-2',
        displayName: 'B',
        hardMatchAnswers: {
          birthDate: '1999-07-10',
          partnerAgeMin: 18,
          partnerAgeMax: 30,
          gender: '男',
          partnerGenders: ['女'],
          looks: '普通人',
          partnerLooks: ['普通人'],
          heightCm: 165,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢阅读。',
          school: SCHOOL_CUC,
          excludedPartnerSchools: [],
        },
        answers: {},
        intent: 'BOTH',
      },
    ]);
    jest.spyOn(testHarness, 'calculatePairs').mockResolvedValue({
      candidates: [],
      selectedPairs: [
        {
          left: { id: 'user-1' },
          right: { id: 'user-2' },
          score: 88,
        },
      ],
    });

    await expect(
      service.runRevealCycle({ force: true, cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
    });

    expect(matchDeleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
    expect(snapshotDeleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
  });

  it('ignores matches from the current cycle when loading historical pair exclusions', async () => {
    const prisma = createPairCalculationPrisma();
    const matchFindMany = prisma.match.findMany;
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);

    await calculatePairs(
      [
        createBroadParticipant('user-a', {}),
        createBroadParticipant('user-b', {}),
      ],
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-1',
    );

    expect(matchFindMany).toHaveBeenCalledWith({
      where: {
        participants: {
          some: {
            userId: {
              in: ['user-a', 'user-b'],
            },
          },
        },
        cycleId: {
          not: 'cycle-1',
        },
      },
      select: {
        participants: {
          select: {
            userId: true,
          },
        },
      },
    });
  });

  it('selects the highest-scoring disjoint pairs from an overlapping candidate pool', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);

    const participants = [
      createBroadParticipant('user-a', {
        relationship_intent: 'serious',
        values: ['honesty', 'stability'],
      }),
      createBroadParticipant('user-b', {
        relationship_intent: 'serious',
        values: ['honesty', 'stability'],
      }),
      createBroadParticipant('user-c', {
        relationship_intent: 'slow',
        values: ['humor', 'growth'],
      }),
      createBroadParticipant('user-d', {
        relationship_intent: 'slow',
        values: ['humor', 'growth'],
      }),
    ];

    const result = await calculatePairs(
      participants,
      [RELATIONSHIP_QUESTION, VALUE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.selectedPairs).toHaveLength(2);
    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-a' },
      right: { id: 'user-b' },
      score: 100,
    });
    expect(result.selectedPairs[1]).toMatchObject({
      left: { id: 'user-c' },
      right: { id: 'user-d' },
      score: 100,
    });
  });

  it('maximizes matched users once hard constraints have been applied', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 95,
            },
            'user-a::user-c': {
              rawScore: 60,
            },
            'user-b::user-d': {
              rawScore: 60,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.selectedPairs).toHaveLength(2);
    expect(
      result.selectedPairs.map((pair) => ({
        pairKey: [pair.left.id, pair.right.id].sort().join('::'),
        score: pair.score,
      })),
    ).toEqual([
      {
        pairKey: 'user-a::user-c',
        score: 60,
      },
      {
        pairKey: 'user-b::user-d',
        score: 60,
      },
    ]);
  });

  it('does not accept a higher-scoring pair when that leaves fewer users matched', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 100,
            },
            'user-a::user-c': {
              rawScore: 40,
            },
            'user-b::user-d': {
              rawScore: 40,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.selectedPairs).toHaveLength(2);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-a::user-c', 'user-b::user-d']);
  });

  it('prioritizes a participant with three consecutive unmatched revealed opt-ins', async () => {
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-priority',
          'cycle-3',
          '2026-04-03T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-2',
          '2026-04-02T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 100,
            },
            'user-a::user-priority': {
              rawScore: 60,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-4',
    );

    expect(result.selectedPairs).toHaveLength(1);
    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-priority' },
      right: { id: 'user-a' },
      score: 60,
    });
  });

  it('does not reset an unmatched streak when a user skipped a revealed cycle', async () => {
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-priority',
          'cycle-4',
          '2026-04-04T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-3',
          '2026-04-03T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-0',
          '2026-03-31T00:00:00.000Z',
        ),
      ],
      matchedParticipations: [
        {
          userId: 'user-priority',
          cycleId: 'cycle-0',
        },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 100,
            },
            'user-a::user-priority': {
              rawScore: 60,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-5',
    );

    expect(result.selectedPairs).toHaveLength(1);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-a::user-priority']);
  });

  it('resets the unmatched streak after a matched revealed opt-in', async () => {
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-priority',
          'cycle-4',
          '2026-04-04T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-3',
          '2026-04-03T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-2',
          '2026-04-02T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-priority',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
      ],
      matchedParticipations: [
        {
          userId: 'user-priority',
          cycleId: 'cycle-2',
        },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 100,
            },
            'user-a::user-priority': {
              rawScore: 60,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-5',
    );

    expect(result.selectedPairs).toHaveLength(1);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-a::user-b']);
  });

  it('maximizes raw compatibility when display scores tie', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 100,
            },
            'user-c::user-d': {
              rawScore: 100,
            },
            'user-a::user-c': {
              rawScore: 101,
            },
            'user-b::user-d': {
              rawScore: 98,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.selectedPairs).toHaveLength(2);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-a::user-b', 'user-c::user-d']);
  });

  it('finds the only compatible pair even between far-apart participants in a large set', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = Array.from({ length: 260 }, (_, index) =>
      createBroadParticipant(`user-${String(index).padStart(3, '0')}`, {}),
    );

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          if (pairKey !== 'user-000::user-129') {
            return null;
          }

          return {
            rawScore: 100,
            scoreBounds: MOCK_RAW_SCORE_BOUNDS,
          };
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.selectedPairs).toHaveLength(1);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-000::user-129']);
  });

  it('falls back to the next valid candidate when the top-scoring pair already exists in history', async () => {
    const prisma = createPairCalculationPrisma({
      historicalMatches: [
        {
          participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
        },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': {
              rawScore: 98,
            },
            'user-a::user-c': {
              rawScore: 94,
            },
            'user-b::user-d': {
              rawScore: 91,
            },
          };

          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-2',
    );

    expect(
      result.selectedPairs.map((pair) => ({
        pairKey: [pair.left.id, pair.right.id].sort().join('::'),
        score: pair.score,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          pairKey: 'user-a::user-c',
          score: 94,
        },
        {
          pairKey: 'user-b::user-d',
          score: 91,
        },
      ]),
    );
    expect(
      result.selectedPairs.some(
        (pair) =>
          [pair.left.id, pair.right.id].sort().join('::') === 'user-a::user-b',
      ),
    ).toBe(false);
  });

  it('excludes blocked and previously matched pairs before choosing the final result set', async () => {
    const prisma = createPairCalculationPrisma({
      blocks: [{ blockerId: 'user-a', blockedId: 'user-b' }],
      historicalMatches: [
        {
          participants: [{ userId: 'user-a' }, { userId: 'user-c' }],
        },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);

    const participants = [
      createBroadParticipant('user-a', {
        relationship_intent: 'serious',
        values: ['honesty', 'stability'],
      }),
      createBroadParticipant('user-b', {
        relationship_intent: 'serious',
        values: ['honesty', 'stability'],
      }),
      createBroadParticipant('user-c', {
        relationship_intent: 'serious',
        values: ['honesty', 'growth'],
      }),
    ];

    const result = await calculatePairs(
      participants,
      [RELATIONSHIP_QUESTION, VALUE_QUESTION],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.selectedPairs).toHaveLength(1);
    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-b' },
      right: { id: 'user-c' },
      score: 96.4,
    });
  });

  it('gives a first-cycle opt-in a lowest-tier boost that can flip an otherwise-higher-scoring returning pair', async () => {
    // user-a and user-b are returning users: they opted in to a prior revealed
    // cycle and were matched there, so their unmatched streak is 0 (no streak
    // bonus). user-c is in their very first opt-in cycle. With three
    // participants only one pair can be selected.
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-a',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-b',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
      ],
      matchedParticipations: [
        { userId: 'user-a', cycleId: 'cycle-1' },
        { userId: 'user-b', cycleId: 'cycle-1' },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            // returning pair, no first-cycle boost
            'user-a::user-b': { rawScore: 64 },
            // contains first-cycle user-c
            'user-a::user-c': { rawScore: 60 },
          };
          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-4',
    );

    // Without the boost user-a::user-b (64) outranks user-a::user-c (60).
    // The +6 first-cycle boost on user-c lifts user-a::user-c above it.
    expect(result.selectedPairs).toHaveLength(1);
    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-a' },
      right: { id: 'user-c' },
      score: 60,
    });
  });

  it('does not boost a returning participant who has a prior revealed opt-in', async () => {
    // Same shape as the boost test, but user-c is ALSO a returning user with a
    // prior revealed opt-in (its optedInAt would be refreshed by sticky
    // carry-over, yet the prior revealed participation marks it as not-first).
    // With nobody in their first cycle, no boost applies and the higher-raw
    // returning pair user-a::user-b (64) wins over user-a::user-c (60).
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-a',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-b',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-c',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
      ],
      matchedParticipations: [
        { userId: 'user-a', cycleId: 'cycle-1' },
        { userId: 'user-b', cycleId: 'cycle-1' },
        { userId: 'user-c', cycleId: 'cycle-1' },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': { rawScore: 64 },
            'user-a::user-c': { rawScore: 60 },
          };
          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-4',
    );

    expect(result.selectedPairs).toHaveLength(1);
    expect(result.selectedPairs[0]).toMatchObject({
      left: { id: 'user-a' },
      right: { id: 'user-b' },
      score: 64,
    });
  });

  it('keeps maximizing matched users even when the highest-scoring pair is all first-cycle', async () => {
    // user-a and user-b are first-cycle (no prior participation); user-c and
    // user-d are returning users matched before (streak 0). Pairing a-b scores
    // 100 and carries a +12 both-new boost, but selecting it leaves c and d
    // unmatched. The match-count tier must still win, pairing a-c and b-d.
    const prisma = createPairCalculationPrisma({
      historicalParticipations: [
        createHistoricalParticipation(
          'user-c',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
        createHistoricalParticipation(
          'user-d',
          'cycle-1',
          '2026-04-01T00:00:00.000Z',
        ),
      ],
      matchedParticipations: [
        { userId: 'user-c', cycleId: 'cycle-1' },
        { userId: 'user-d', cycleId: 'cycle-1' },
      ],
    });
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'calculatePairRawScore'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'calculatePairRawScore')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<string, { rawScore: number }> = {
            'user-a::user-b': { rawScore: 100 },
            'user-a::user-c': { rawScore: 40 },
            'user-b::user-d': { rawScore: 40 },
          };
          const score = scoreByPairKey[pairKey];
          return score
            ? { ...score, scoreBounds: MOCK_RAW_SCORE_BOUNDS }
            : null;
        },
      );

    const result = await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-4',
    );

    expect(result.selectedPairs).toHaveLength(2);
    expect(
      result.selectedPairs.map((pair) =>
        [pair.left.id, pair.right.id].sort().join('::'),
      ),
    ).toEqual(['user-a::user-c', 'user-b::user-d']);
  });

  it('loads first-cycle status using the same revealed opted-in window as unmatched streaks', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    await calculatePairs(
      participants,
      [],
      new Date('2026-04-10T00:00:00.000Z'),
      'cycle-current',
    );

    // The first-cycle lookup must mirror the unmatched-streak window — earlier
    // REVEALED opt-ins with a usable intent, current cycle excluded — so a
    // returning user is never misread as first-cycle. The streak query carries
    // no distinct, so this exact-shape assertion only matches the first-cycle
    // query. These where fields are not exercised by the resolved-value mock.
    expect(prisma.cycleParticipation.findMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ['user-a', 'user-b'] },
        status: 'OPTED_IN',
        intent: { not: null },
        cycleId: { not: 'cycle-current' },
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: new Date('2026-04-10T00:00:00.000Z') },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
  });
});
