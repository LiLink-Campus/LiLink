import { BadRequestException } from '@nestjs/common';
import { Prisma, QuestionType } from '@prisma/client';
import { CyclesService } from './cycles.service';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';

type EligibleParticipantStub = {
  id: string;
  displayName: string | null;
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
      options: Array<{ value: string; label: string }>;
      reasonRules: Array<{
        type: 'EXACT_MATCH';
        template: string;
        priority: number;
      }>;
    }>,
    revealAt: Date,
  ) => {
    rawScore: number;
    score: number;
    reasons: string[];
    sharedSignals: unknown[];
  } | null;
  toEligibleParticipants: (
    participations: unknown[],
  ) => EligibleParticipantStub[];
  calculatePairs: (
    participants: EligibleParticipantStub[],
    questions: unknown[],
    revealAt: Date,
    currentCycleId?: string,
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

describe('CyclesService', () => {
  afterEach(() => {
    clearStickyParticipationCache();
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
    const service = new CyclesService(prisma as never);

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
        Promise.resolve(
          fn({
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
          }),
        ),
      ),
    };
    const service = new CyclesService(prisma as never);

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1', force: true }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'REVEALED',
      createdMatches: 0,
    });
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
    const service = new CyclesService(prisma as never);

    await expect(service.previewCycle('cycle-1')).resolves.toMatchObject({
      cycleId: 'cycle-1',
      candidates: [],
      suggestedPairs: [],
      unmatchedUserIds: [],
    });
    expect(matchCycleFindUnique).toHaveBeenCalledTimes(1);
  });

  it('injects the current school id when building eligible participants', () => {
    const service = new CyclesService({} as never);
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
    const service = new CyclesService({} as never);
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
    const service = new CyclesService({} as never);
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
    const service = new CyclesService({} as never);
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
    const service = new CyclesService({} as never);
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
    const service = new CyclesService({} as never);
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

  it('builds reasons from configured question templates instead of hard-coded keys', () => {
    const service = new CyclesService({} as never);
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
      rawScore: 66,
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

  it('fills pending narratives while a cycle stays in PREPARING', async () => {
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
    const service = new CyclesService(
      prisma as never,
      matchNarrativeService as never,
    );
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
        OR: [
          { reason: null },
          { conversationTopics: { equals: Prisma.AnyNull } },
          { narrativeSource: null },
        ],
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
    const service = new CyclesService(
      prisma as never,
      matchNarrativeService as never,
    );

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
        OR: [
          { reason: null },
          { conversationTopics: { equals: Prisma.AnyNull } },
          { narrativeSource: null },
        ],
      },
      data: {
        reason: defaultNarrative.reason,
        conversationTopics: defaultNarrative.conversationTopics,
        narrativeSource: 'RULES_FALLBACK',
      },
    });
  });

  it('falls back immediately when narrative generation fails during preparation', async () => {
    const claimPreparation = jest.fn().mockResolvedValue({ count: 1 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const finalizePreparation = jest.fn().mockResolvedValue({ id: 'cycle-1' });
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
            },
            matchCycle: {
              update: finalizePreparation,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const matchNarrativeService = {
      generateNarrative: jest
        .fn()
        .mockRejectedValue(new Error('DeepSeek is unavailable.')),
      buildDefaultNarrative: jest.fn().mockReturnValue(defaultNarrative),
    };
    const service = new CyclesService(
      prisma as never,
      matchNarrativeService as never,
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
    const matchCreateCalls = matchCreate.mock.calls as Array<
      [
        {
          data: {
            reason: string;
            conversationTopics: string[];
            narrativeSource: string;
          };
        },
      ]
    >;
    expect(matchCreateCalls[0]?.[0].data.reason).toBe(defaultNarrative.reason);
    expect(matchCreateCalls[0]?.[0].data.conversationTopics).toEqual(
      defaultNarrative.conversationTopics,
    );
    expect(matchCreateCalls[0]?.[0].data.narrativeSource).toBe(
      'RULES_FALLBACK',
    );
    expect(finalizePreparation).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
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

  it('restarts matching when a manually-set PREPARING cycle has no generated matches yet', async () => {
    const reopenPreparingCycle = jest.fn().mockResolvedValue({ count: 1 });
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
        updateMany: reopenPreparingCycle,
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
      {
        generateNarrative: jest.fn(),
        buildDefaultNarrative: jest.fn(),
      } as never,
    );
    const privateService = service as unknown as {
      prepareCycle: (options: {
        cycleId: string;
        force?: boolean;
        adminActorId?: string;
      }) => Promise<{
        ok: true;
        cycleId: string;
        state: 'PREPARED';
        createdMatches: number;
        unmatchedCount: number;
        message: string;
      }>;
    };
    const prepareCycleSpy = jest
      .spyOn(privateService, 'prepareCycle')
      .mockResolvedValue({
        ok: true,
        cycleId: 'cycle-1',
        state: 'PREPARED',
        createdMatches: 1,
        unmatchedCount: 0,
        message: 'Cycle is prepared and waiting for reveal.',
      });

    await expect(
      service.runRevealCycle({ cycleId: 'cycle-1' }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      state: 'PREPARED',
      createdMatches: 1,
    });

    expect(reopenPreparingCycle).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'PREPARING',
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
    const service = new CyclesService(prisma as never);
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
      .spyOn(service as never, 'prepareCycle')
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
    const service = new CyclesService(prisma as never);
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
  });

  it('ignores matches from the current cycle when loading historical pair exclusions', async () => {
    const matchFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: matchFindMany,
      },
    };
    const service = new CyclesService(prisma as never);
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
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CyclesService(prisma as never);
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
      score: 91.4,
      reasons: [
        '你们对进入关系的期待很一致。',
        '你们都把 真诚、稳定 放在重要位置。',
      ],
    });
    expect(result.selectedPairs[1]).toMatchObject({
      left: { id: 'user-c' },
      right: { id: 'user-d' },
      score: 91.4,
      reasons: [
        '你们对进入关系的期待很一致。',
        '你们都把 幽默感、上进 放在重要位置。',
      ],
    });
  });

  it('prioritizes maximum match coverage before total score', async () => {
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CyclesService(prisma as never);
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
    ).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('prefers two lower-scoring pairs over one higher-scoring pair when questions are empty', async () => {
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new CyclesService(prisma as never);
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
    ).toEqual(expect.arrayContaining(['user-a::user-c', 'user-b::user-d']));
  });

  it('falls back to the next valid candidate when the top-scoring pair already exists in history', async () => {
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([
          {
            participants: [{ userId: 'user-a' }, { userId: 'user-b' }],
          },
        ]),
      },
    };
    const service = new CyclesService(prisma as never);
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
    const prisma = {
      block: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ blockerId: 'user-a', blockedId: 'user-b' }]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([
          {
            participants: [{ userId: 'user-a' }, { userId: 'user-c' }],
          },
        ]),
      },
    };
    const service = new CyclesService(prisma as never);
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
      score: 87.1,
      reasons: ['你们对进入关系的期待很一致。', '你们都把 真诚 放在重要位置。'],
    });
  });
});
