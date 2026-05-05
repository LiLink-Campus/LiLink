import { BadRequestException } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Prisma, QuestionType } from '@prisma/client';
import { DashboardSnapshotModule } from '../../common/dashboard/dashboard-snapshot.module';
import { CyclesService } from './cycles.service';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';
import { env } from '../../config/env';
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
  reasons: string[];
  sharedSignals?: unknown[];
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
      reasonRules: unknown[];
    }>,
    revealAt: Date,
  ) => {
    rawScore: number;
    score: number;
    reasons: string[];
    sharedSignals?: unknown[];
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
  generateNarrativesForPairs: (
    selectedPairs: CandidatePairStub[],
    preparedQuestions: unknown[],
  ) => Promise<unknown[]>;
  buildNarrativeQuestionnaire: (
    participant: EligibleParticipantStub,
    preparedQuestions: Array<{
      key: string;
      prompt: string;
      description: string | null;
      type: QuestionType;
      weight: number;
      selectionLimit: number | null;
      normalizedOptions: Array<{ value: string; label: string }>;
      normalizedReasonRules: unknown[];
    }>,
  ) => Array<{
    key: string;
    answerValues: string[];
    answerLabels: string[];
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
  reasonRules: [
    {
      type: 'EXACT_MATCH' as const,
      template: '你们对进入关系的期待很一致。',
      priority: 3,
    },
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
  reasonRules: [
    {
      type: 'MULTI_OVERLAP' as const,
      template: '你们都把 {{labels_2}} 放在重要位置。',
      priority: 2,
      minOverlap: 1,
      maxLabels: 2,
    },
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
  reasonRules: [
    {
      type: 'EXACT_MATCH' as const,
      template: '你们在开放度上都选择了 {{answer_label}}。',
      priority: 2,
    },
  ],
};

const originalNarrativeGenerationEnabled =
  env.MATCH_NARRATIVE_GENERATION_ENABLED;

function createDashboardSnapshotServiceMock() {
  return {
    syncCycleSnapshots: jest.fn().mockResolvedValue(undefined),
  };
}

function createCyclesService(
  prisma: unknown,
  matchNarrativeService?: unknown,
  dashboardSnapshotService = createDashboardSnapshotServiceMock(),
) {
  return new CyclesService(
    prisma as never,
    dashboardSnapshotService as never,
    matchNarrativeService as never,
  );
}

describe('CyclesService', () => {
  afterEach(() => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = originalNarrativeGenerationEnabled;
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

  it('syncs dashboard snapshots when preparation waits for pending narratives', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = true;

    const tx = {
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      match: {
        create: jest.fn().mockResolvedValue({ id: 'match-1' }),
      },
      matchCycle: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          participationDeadline: new Date(Date.now() - 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
      },
      matchParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const dashboardSnapshotService = createDashboardSnapshotServiceMock();
    const service = createCyclesService(
      prisma,
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      },
      dashboardSnapshotService,
    );
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs' | 'generateNarrativesForPairs'
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
          reasons: ['reason'],
        },
      ],
    });
    jest
      .spyOn(testHarness, 'generateNarrativesForPairs')
      .mockResolvedValue([null]);

    const result = await service.runRevealCycle({ cycleId: 'cycle-1' });

    expect(result).toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PENDING',
      createdMatches: 1,
    });

    expect(dashboardSnapshotService.syncCycleSnapshots).toHaveBeenCalledWith(
      'cycle-1',
      tx,
    );
  });

  it('rejects preparing a cycle before participation deadline by default', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
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
    const service = createCyclesService(
      prisma,
      undefined,
      dashboardSnapshotService,
    );

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1', force: true }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'REVEALED',
      createdMatches: 0,
    });
    expect(dashboardSnapshotService.syncCycleSnapshots).toHaveBeenCalledWith(
      'cycle-1',
      revealTx,
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
    const service = createCyclesService(
      prisma,
      undefined,
      dashboardSnapshotService,
    );

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
          },
          {
            userId: 'user-2',
            status: 'OPTED_IN',
            intent: 'DATE',
            updatedAt: new Date('2026-04-11T12:00:00.000Z'),
          },
        ]),
      createMany,
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
      {
        generateNarrative: jest.fn().mockResolvedValue({
          reason:
            '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，因此更容易在后续交流里形成自然、清楚而持续的互动基础。',
          conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
          source: 'DEEPSEEK',
        }),
        buildDefaultNarrative: jest.fn(),
      } as never,
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
          reasons: ['reason'],
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
        updatedAt: expect.any(Date) as unknown as Date,
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

  it('keeps hard-match fields out of DeepSeek narrative questionnaire input', () => {
    const service = createCyclesService({});
    const buildNarrativeQuestionnaire = (
      service as unknown as Pick<
        CyclesServiceTestHarness,
        'buildNarrativeQuestionnaire'
      >
    ).buildNarrativeQuestionnaire.bind(service);

    const questionnaireAnswers = buildNarrativeQuestionnaire(
      createBroadParticipant('user-1', {
        relationship_intent: 'serious',
        values: ['honesty', 'stability'],
        hard_birth_date: '2000-05-10',
        hard_school: SCHOOL_BUPT,
        hard_gender: '非二元',
      }),
      [
        {
          key: 'relationship_intent',
          prompt: 'Intent',
          description: null,
          type: QuestionType.SINGLE_SELECT,
          weight: 3,
          selectionLimit: null,
          normalizedOptions: RELATIONSHIP_QUESTION.options,
          normalizedReasonRules: [],
        },
        {
          key: 'values',
          prompt: 'Values',
          description: null,
          type: QuestionType.MULTI_SELECT,
          weight: 2,
          selectionLimit: null,
          normalizedOptions: VALUE_QUESTION.options,
          normalizedReasonRules: [],
        },
        {
          key: 'hard_birth_date',
          prompt: 'Birth date',
          description: null,
          type: QuestionType.SINGLE_SELECT,
          weight: 1,
          selectionLimit: null,
          normalizedOptions: [],
          normalizedReasonRules: [],
        },
        {
          key: 'hard_school',
          prompt: 'School',
          description: null,
          type: QuestionType.SINGLE_SELECT,
          weight: 1,
          selectionLimit: null,
          normalizedOptions: [],
          normalizedReasonRules: [],
        },
      ],
    );

    expect(questionnaireAnswers).toEqual([
      expect.objectContaining({
        key: 'relationship_intent',
        answerValues: ['serious'],
        answerLabels: ['认真稳定的关系'],
      }),
      expect.objectContaining({
        key: 'values',
        answerValues: ['honesty', 'stability'],
        answerLabels: ['真诚', '稳定'],
      }),
    ]);
  });

  it('keeps hard-match fields out of DeepSeek narrative shared signals', () => {
    const service = createCyclesService({});
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

    const result = scorePair(
      createBroadParticipant('user-1', {
        relationship_intent: 'serious',
        hard_school: SCHOOL_BUPT,
      }),
      createBroadParticipant('user-2', {
        relationship_intent: 'serious',
        hard_school: SCHOOL_BUPT,
      }),
      [
        {
          key: 'relationship_intent',
          prompt: 'Intent',
          type: QuestionType.SINGLE_SELECT,
          weight: 3,
          options: RELATIONSHIP_QUESTION.options,
          reasonRules: [],
        },
        {
          key: 'hard_school',
          prompt: 'School',
          type: QuestionType.SINGLE_SELECT,
          weight: 1,
          options: [{ value: SCHOOL_BUPT, label: '北京邮电大学' }],
          reasonRules: [],
        },
      ],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result?.sharedSignals).toEqual([
      expect.objectContaining({
        questionKey: 'relationship_intent',
      }),
    ]);
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
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

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
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

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
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);
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

  it('builds reasons from configured question templates instead of hard-coded keys', () => {
    const service = createCyclesService({});
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

    const result = scorePair(
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
        answers: {
          relationship_intent: 'serious',
        },
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
        answers: {
          relationship_intent: 'serious',
        },
        intent: 'BOTH',
      },
      [
        {
          key: 'relationship_intent',
          prompt: 'Intent',
          type: QuestionType.SINGLE_SELECT,
          weight: 3,
          options: [
            { value: 'serious', label: '认真稳定的关系' },
            { value: 'slow', label: '先认识、慢慢发展' },
          ],
          reasonRules: [
            {
              type: 'EXACT_MATCH',
              template: '你们对进入关系的期待很一致。',
              priority: 3,
            },
          ],
        },
      ],
      new Date('2026-04-10T00:00:00.000Z'),
    );

    expect(result).toMatchObject({
      rawScore: 75,
      score: 100,
      reasons: ['你们对进入关系的期待很一致。'],
    });
    expect(result?.sharedSignals).toEqual([
      expect.objectContaining({
        questionKey: 'relationship_intent',
        type: 'EXACT_MATCH',
      }),
    ]);
  });

  it('normalizes multi-select scoring so broad selections are not rewarded', () => {
    const service = createCyclesService({});
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

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
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

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
    const scorePair = (
      service as unknown as Pick<CyclesServiceTestHarness, 'scorePair'>
    ).scorePair.bind(service);

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
      normalizedReasonRules: VALUE_QUESTION.reasonRules,
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
      reasons: ['你们都把 真诚、稳定 放在重要位置。'],
    });
  });

  it('fills pending narratives while a cycle stays in PREPARING', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = true;

    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchCycleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const pendingMatch = {
      id: 'match-1',
      score: 88,
      reasons: ['reason'],
      createdAt: new Date(Date.now() - 5 * 60_000),
      participants: [
        { userId: 'user-1', position: 1 },
        { userId: 'user-2', position: 2 },
      ],
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:10:00.000Z'),
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
      match: {
        findMany: jest.fn().mockResolvedValue([pendingMatch]),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            match: {
              updateMany: matchUpdateMany,
            },
            matchCycle: {
              updateMany: matchCycleUpdateMany,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const matchNarrativeService = {
      generateNarrative: jest.fn().mockResolvedValue({
        reason:
          '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，因此更容易在后续交流里形成自然、清楚而持续的互动基础。',
        conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
        source: 'DEEPSEEK',
      }),
      buildDefaultNarrative: jest.fn(),
    };
    const service = createCyclesService(prisma, matchNarrativeService);
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants'
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

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PREPARED',
      createdMatches: 1,
    });

    expect(matchNarrativeService.generateNarrative).toHaveBeenCalledTimes(1);
    expect(matchNarrativeService.buildDefaultNarrative).not.toHaveBeenCalled();
    expect(matchUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        narrativeSource: null,
      },
      data: {
        reason:
          '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，因此更容易在后续交流里形成自然、清楚而持续的互动基础。',
        conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
        narrativeSource: 'DEEPSEEK',
      },
    });
    expect(matchCycleUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as unknown as Date,
      },
      data: {
        status: 'REVEAL_READY',
      },
    });
    const preparedAuditLogCalls = auditLogCreate.mock.calls as Array<
      [
        {
          data: {
            action: string;
          };
        },
      ]
    >;
    const finalizedPreparedCall = preparedAuditLogCalls.find(
      ([call]) => call.data.action === 'cycle.prepared',
    );
    expect(finalizedPreparedCall).toBeDefined();
  });

  it('disables pending narratives while a cycle stays in PREPARING', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = false;

    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchCycleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const pendingMatch = {
      id: 'match-1',
      score: 88,
      reasons: ['reason'],
      createdAt: new Date(Date.now() - 5 * 60_000),
      participants: [
        { userId: 'user-1', position: 1 },
        { userId: 'user-2', position: 2 },
      ],
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:10:00.000Z'),
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
      match: {
        findMany: jest.fn().mockResolvedValue([pendingMatch]),
        updateMany: matchUpdateMany,
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            match: {
              updateMany: matchUpdateMany,
            },
            matchCycle: {
              updateMany: matchCycleUpdateMany,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const matchNarrativeService = {
      generateNarrative: jest.fn().mockResolvedValue({
        reason:
          '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，因此更容易在后续交流里形成自然、清楚而持续的互动基础。',
        conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
        source: 'DEEPSEEK',
      }),
      buildDefaultNarrative: jest.fn(),
    };
    const service = createCyclesService(prisma, matchNarrativeService);
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants'
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

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PREPARED',
      createdMatches: 1,
    });

    expect(matchNarrativeService.generateNarrative).not.toHaveBeenCalled();
    expect(matchNarrativeService.buildDefaultNarrative).not.toHaveBeenCalled();
    expect(matchUpdateMany).toHaveBeenCalledWith({
      where: {
        cycleId: 'cycle-1',
        narrativeSource: null,
      },
      data: {
        conversationTopics: [],
        narrativeSource: 'DISABLED',
      },
    });
    expect(matchCycleUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as unknown as Date,
      },
      data: {
        status: 'REVEAL_READY',
      },
    });
    const preparedAuditLogCalls = auditLogCreate.mock.calls as Array<
      [
        {
          data: {
            action: string;
          };
        },
      ]
    >;
    const finalizedPreparedCall = preparedAuditLogCalls.find(
      ([call]) => call.data.action === 'cycle.prepared',
    );
    expect(finalizedPreparedCall).toBeDefined();
  });

  it('uses the default narrative after one hour instead of retrying forever', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = true;

    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchCycleUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'PREPARING',
          participationDeadline: new Date(Date.now() - 2 * 60_000),
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:10:00.000Z'),
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
      match: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'match-1',
            score: 88,
            reasons: ['reason'],
            createdAt: new Date(Date.now() - 61 * 60_000),
            participants: [
              { userId: 'user-1', position: 1 },
              { userId: 'user-2', position: 2 },
            ],
          },
        ]),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            match: {
              updateMany: matchUpdateMany,
            },
            matchCycle: {
              updateMany: matchCycleUpdateMany,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const defaultNarrative = {
      reason:
        '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，这意味着彼此在建立信任、理解边界和推进交流时，更容易形成自然、清楚而持续的互动基础，也更容易把后续相处落到舒服、平衡且可继续发展的日常节奏里。',
      conversationTopics: [
        '最近一次让你觉得很放松的周末通常怎么过',
        '你最近在慢慢坚持的一件事是什么',
        '什么样的聊天节奏会让你觉得相处自然',
      ],
      source: 'RULES_FALLBACK' as const,
    };
    const matchNarrativeService = {
      generateNarrative: jest.fn(),
      buildDefaultNarrative: jest.fn().mockReturnValue(defaultNarrative),
    };
    const service = createCyclesService(prisma, matchNarrativeService);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PREPARED',
      createdMatches: 1,
    });

    expect(matchNarrativeService.generateNarrative).not.toHaveBeenCalled();
    expect(matchNarrativeService.buildDefaultNarrative).toHaveBeenCalledTimes(
      1,
    );
    expect(matchUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        narrativeSource: null,
      },
      data: {
        reason: defaultNarrative.reason,
        conversationTopics: defaultNarrative.conversationTopics,
        narrativeSource: 'RULES_FALLBACK',
      },
    });
  });

  it('falls back immediately when narrative generation fails during preparation', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = true;

    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const finalizePreparationClaim = jest.fn().mockResolvedValue({ count: 1 });
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const defaultNarrative = {
      reason:
        '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，这意味着彼此在建立信任、理解边界和推进交流时，更容易形成自然、清楚而持续的互动基础。',
      conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
      source: 'RULES_FALLBACK' as const,
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
    let matchWasCreatedBeforeNarrative = false;
    const matchNarrativeService = {
      generateNarrative: jest.fn().mockImplementation(() => {
        matchWasCreatedBeforeNarrative = matchCreate.mock.calls.length === 1;
        return Promise.reject(new Error('DeepSeek is unavailable.'));
      }),
      buildDefaultNarrative: jest.fn().mockReturnValue(defaultNarrative),
    };
    const service = createCyclesService(prisma, matchNarrativeService);
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
          reasons: ['reason'],
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
    });

    expect(matchNarrativeService.generateNarrative).toHaveBeenCalledTimes(1);
    expect(matchNarrativeService.buildDefaultNarrative).toHaveBeenCalledTimes(
      1,
    );
    expect(matchWasCreatedBeforeNarrative).toBe(true);
    const matchCreateCalls = matchCreate.mock.calls as Array<
      [
        {
          data: {
            reason: string | null;
            conversationTopics: string[] | typeof Prisma.DbNull;
            narrativeSource: string | null;
          };
        },
      ]
    >;
    expect(matchCreateCalls[0]?.[0].data.reason).toBeNull();
    expect(matchCreateCalls[0]?.[0].data.conversationTopics).toBe(
      Prisma.DbNull,
    );
    expect(matchCreateCalls[0]?.[0].data.narrativeSource).toBeNull();
    expect(matchUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        narrativeSource: null,
      },
      data: {
        reason: defaultNarrative.reason,
        conversationTopics: defaultNarrative.conversationTopics,
        narrativeSource: 'RULES_FALLBACK',
      },
    });
    expect(finalizePreparationClaim).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as unknown as Date,
      },
      data: {
        status: 'REVEAL_READY',
      },
    });
    const fallbackAuditLogCalls = auditLogCreate.mock.calls as Array<
      [
        {
          data: {
            action: string;
          };
        },
      ]
    >;
    const fallbackPreparedCall = fallbackAuditLogCalls.find(
      ([call]) => call.data.action === 'cycle.prepared',
    );
    expect(fallbackPreparedCall).toBeDefined();
  });

  it('skips narrative generation when match narratives are disabled', async () => {
    env.MATCH_NARRATIVE_GENERATION_ENABLED = false;

    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const finalizePreparationClaim = jest.fn().mockResolvedValue({ count: 1 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const matchUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
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
    const matchNarrativeService = {
      generateNarrative: jest.fn(),
      buildDefaultNarrative: jest.fn(),
    };
    const service = createCyclesService(prisma, matchNarrativeService);
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
          reasons: ['reason'],
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
    });

    expect(matchNarrativeService.generateNarrative).not.toHaveBeenCalled();
    expect(matchNarrativeService.buildDefaultNarrative).not.toHaveBeenCalled();
    expect(matchUpdateMany).not.toHaveBeenCalled();
    const matchCreateCalls = matchCreate.mock.calls as Array<
      [
        {
          data: {
            reason: string | null;
            conversationTopics: string[];
            narrativeSource: string | null;
          };
        },
      ]
    >;
    expect(matchCreateCalls[0]?.[0].data).toMatchObject({
      reason: null,
      conversationTopics: [],
      narrativeSource: 'DISABLED',
    });
    expect(finalizePreparationClaim).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        updatedAt: expect.any(Date) as unknown as Date,
      },
      data: {
        status: 'REVEAL_READY',
      },
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
    const matchNarrativeService = {
      generateNarrative: jest.fn().mockResolvedValue({
        reason:
          '你们在沟通取向、关系节奏和价值判断上的整体方向比较接近，因此更容易在后续交流里形成自然、清楚而持续的互动基础。',
        conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
        source: 'DEEPSEEK',
      }),
      buildDefaultNarrative: jest.fn(),
    };
    const service = createCyclesService(prisma, matchNarrativeService);
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
          reasons: ['reason'],
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
        updatedAt: expect.any(Date) as unknown as Date,
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
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      } as never,
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
        updatedAt: expect.any(Date) as unknown as Date,
      },
    });
    expect(matchCycleUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        matches: { none: {} },
        updatedAt: expect.any(Date) as unknown as Date,
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
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      } as never,
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
          reasons: ['reason'],
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
        updatedAt: expect.any(Date) as unknown as Date,
      },
      data: {
        updatedAt: expect.any(Date) as unknown as Date,
      },
    });
    expect(matchCreate).not.toHaveBeenCalled();
    expect(claimPreparation).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
        matches: { none: {} },
        updatedAt: expect.any(Date) as unknown as Date,
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
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      } as never,
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

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: {
        cycleId: 'cycle-1',
        narrativeSource: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        score: true,
        reasons: true,
        createdAt: true,
        participants: {
          select: {
            userId: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
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
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      } as never,
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

  it('limits narrative generation concurrency during reveal', async () => {
    const service = new CyclesService(
      {
        matchCycle: {},
        questionnaireVersion: {},
        $transaction: jest.fn(),
      } as never,
      createDashboardSnapshotServiceMock() as never,
      {
        generateNarrative: jest.fn(),
      } as never,
    );
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'generateNarrativesForPairs'
    >;
    let activeNarrativeCalls = 0;
    let maxActiveNarrativeCalls = 0;
    const pendingResolvers: Array<() => void> = [];

    (
      service as unknown as {
        matchNarrativeService: {
          generateNarrative: (input: unknown) => Promise<unknown>;
        };
      }
    ).matchNarrativeService.generateNarrative = jest.fn(
      () =>
        new Promise((resolve) => {
          activeNarrativeCalls += 1;
          maxActiveNarrativeCalls = Math.max(
            maxActiveNarrativeCalls,
            activeNarrativeCalls,
          );
          pendingResolvers.push(() => {
            activeNarrativeCalls -= 1;
            resolve({
              reason: 'reason paragraph',
              conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
              source: 'RULES_FALLBACK',
            });
          });
        }),
    );

    const generationPromise = testHarness.generateNarrativesForPairs(
      [
        {
          left: { id: 'user-1' },
          right: { id: 'user-2' },
          score: 88,
          reasons: ['ab'],
        },
        {
          left: { id: 'user-3' },
          right: { id: 'user-4' },
          score: 87,
          reasons: ['cd'],
        },
        {
          left: { id: 'user-5' },
          right: { id: 'user-6' },
          score: 86,
          reasons: ['ef'],
        },
        {
          left: { id: 'user-7' },
          right: { id: 'user-8' },
          score: 85,
          reasons: ['gh'],
        },
        {
          left: { id: 'user-9' },
          right: { id: 'user-10' },
          score: 84,
          reasons: ['ij'],
        },
      ],
      [],
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(maxActiveNarrativeCalls).toBe(3);
    expect(pendingResolvers).toHaveLength(3);

    while (pendingResolvers.length > 0) {
      const currentBatch = pendingResolvers.splice(0);
      currentBatch.forEach((resolveNarrative) => resolveNarrative());
      await new Promise<void>((resolve) => setImmediate(resolve));
    }

    await expect(generationPromise).resolves.toHaveLength(5);
    expect(maxActiveNarrativeCalls).toBe(3);
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
          reasons: ['reason'],
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
      reasons: [
        '你们对进入关系的期待很一致。',
        '你们都把 真诚、稳定 放在重要位置。',
      ],
    });
    expect(result.selectedPairs[1]).toMatchObject({
      left: { id: 'user-c' },
      right: { id: 'user-d' },
      score: 100,
      reasons: [
        '你们对进入关系的期待很一致。',
        '你们都把 幽默感、上进 放在重要位置。',
      ],
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 95,
              score: 95,
              reasons: ['ab'],
            },
            'user-a::user-c': {
              rawScore: 60,
              score: 60,
              reasons: ['ac'],
            },
            'user-b::user-d': {
              rawScore: 60,
              score: 60,
              reasons: ['bd'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
        reasons: pair.reasons,
      })),
    ).toEqual([
      {
        pairKey: 'user-a::user-c',
        score: 60,
        reasons: ['ac'],
      },
      {
        pairKey: 'user-b::user-d',
        score: 60,
        reasons: ['bd'],
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 100,
              score: 100,
              reasons: ['ab'],
            },
            'user-a::user-c': {
              rawScore: 40,
              score: 40,
              reasons: ['ac'],
            },
            'user-b::user-d': {
              rawScore: 40,
              score: 40,
              reasons: ['bd'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 100,
              score: 100,
              reasons: ['highest-compatibility'],
            },
            'user-a::user-priority': {
              rawScore: 60,
              score: 60,
              reasons: ['retention-priority'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
      reasons: ['retention-priority'],
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 100,
              score: 100,
              reasons: ['highest-compatibility'],
            },
            'user-a::user-priority': {
              rawScore: 60,
              score: 60,
              reasons: ['skipped-week-does-not-reset'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-priority', {}),
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 100,
              score: 100,
              reasons: ['highest-compatibility'],
            },
            'user-a::user-priority': {
              rawScore: 60,
              score: 60,
              reasons: ['below-threshold'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 100,
              score: 90,
              reasons: ['ab'],
            },
            'user-c::user-d': {
              rawScore: 100,
              score: 90,
              reasons: ['cd'],
            },
            'user-a::user-c': {
              rawScore: 101,
              score: 90.1,
              reasons: ['ac'],
            },
            'user-b::user-d': {
              rawScore: 98,
              score: 89.9,
              reasons: ['bd'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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

  it('samples spread-out candidates beyond the local scan window', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'scorePair'
    >;
    const participants = Array.from({ length: 260 }, (_, index) =>
      createBroadParticipant(`user-${String(index).padStart(3, '0')}`, {}),
    );

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          if (pairKey !== 'user-000::user-129') {
            return null;
          }

          return {
            rawScore: 100,
            score: 100,
            reasons: ['spread'],
            sharedSignals: [],
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

  it('scores the only compatible pair even when it would be missed by bounded sampling', async () => {
    const prisma = createPairCalculationPrisma();
    const service = createCyclesService(prisma);
    const calculatePairs = (
      service as unknown as Pick<CyclesServiceTestHarness, 'calculatePairs'>
    ).calculatePairs.bind(service);
    const scorePairHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'scorePair'
    >;
    const participants = Array.from({ length: 260 }, (_, index) =>
      createBroadParticipant(`user-${String(index).padStart(3, '0')}`, {}),
    );

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          if (pairKey !== 'user-000::user-017') {
            return null;
          }

          return {
            rawScore: 100,
            score: 100,
            reasons: ['only-compatible'],
            sharedSignals: [],
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
    ).toEqual(['user-000::user-017']);
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
      'scorePair'
    >;
    const participants = [
      createBroadParticipant('user-a', {}),
      createBroadParticipant('user-b', {}),
      createBroadParticipant('user-c', {}),
      createBroadParticipant('user-d', {}),
    ];

    jest
      .spyOn(scorePairHarness, 'scorePair')
      .mockImplementation(
        (left: EligibleParticipantStub, right: EligibleParticipantStub) => {
          const pairKey = [left.id, right.id].sort().join('::');
          const scoreByPairKey: Record<
            string,
            { rawScore: number; score: number; reasons: string[] }
          > = {
            'user-a::user-b': {
              rawScore: 98,
              score: 98,
              reasons: ['ab'],
            },
            'user-a::user-c': {
              rawScore: 94,
              score: 94,
              reasons: ['ac'],
            },
            'user-b::user-d': {
              rawScore: 91,
              score: 91,
              reasons: ['bd'],
            },
          };

          return scoreByPairKey[pairKey] ?? null;
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
      reasons: ['你们对进入关系的期待很一致。', '你们都把 真诚 放在重要位置。'],
    });
  });
});
