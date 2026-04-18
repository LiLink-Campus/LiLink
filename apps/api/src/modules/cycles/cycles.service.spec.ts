import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
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
  };
  answers: Record<string, unknown>;
};

type CandidatePairStub = {
  left: { id: string };
  right: { id: string };
  score: number;
  reasons: string[];
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
  ) => { rawScore: number; score: number; reasons: string[] } | null;
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
};

const SCHOOL_BUPT = 'school-bupt';
const SCHOOL_CUC = 'school-cuc';

function createBroadParticipant(
  id: string,
  answers: Record<string, unknown>,
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

  it('rejects running a cycle before reveal time by default', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
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

    await expect(service.runRevealCycle()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows an explicit internal force run before reveal time', async () => {
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
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
        Promise.resolve(fn({ cycleParticipation })),
      ),
    };
    const service = new CyclesService(prisma as never);

    await expect(service.runRevealCycle({ force: true })).resolves.toEqual({
      ok: true,
      message:
        'Not enough complete participants to generate matches. No users are opted in (OPTED_IN) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers are required.',
    });
  });

  it('backfills sticky participation records before running an existing open cycle', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const matchDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
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
            updatedAt: new Date('2026-04-10T12:00:00.000Z'),
          },
          {
            userId: 'user-2',
            status: 'OPTED_IN',
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
            revealAt: new Date(Date.now() - 60_000),
            createdAt: new Date('2026-04-20T12:00:00.000Z'),
            updatedAt: new Date(Date.now() - 60_000),
            participations: [],
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            status: 'OPEN',
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
          }),
        updateMany,
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
      cycleParticipation,
      match: {
        deleteMany: matchDeleteMany,
      },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              deleteMany: matchDeleteMany,
              create: matchCreate,
            },
            matchCycle: {
              update: matchCycleUpdate,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
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
          heightCm: 165,
          partnerHeightMin: 120,
          partnerHeightMax: 220,
          oneLinerIntro: '喜欢徒步。',
          school: SCHOOL_BUPT,
          excludedPartnerSchools: [],
        },
        answers: {},
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
      createdMatches: 1,
    });

    const createManyCalls = createMany.mock.calls as Array<
      [
        {
          data: Array<{
            cycleId: string;
            userId: string;
            status: 'OPTED_IN' | 'OPTED_OUT';
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
    expect(createManyArgument.data).toEqual([
      {
        cycleId: 'cycle-1',
        userId: 'user-1',
        status: 'OPTED_IN',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-1',
        userId: 'user-2',
        status: 'OPTED_IN',
        optedInAt: createManyArgument.data[1]?.optedInAt ?? null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
    expect(createManyArgument.data[1]?.optedInAt).toBeInstanceOf(Date);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'OPEN',
      },
      data: {
        status: 'REVEAL_READY',
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
    });
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

    expect(result).toEqual({
      rawScore: 66,
      score: 100,
      reasons: ['你们对进入关系的期待很一致。'],
    });
  });

  it('recovers a stale reveal-ready cycle before executing it', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'cycle-1' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const matchCycleUpdate = jest.fn().mockResolvedValue({ id: 'cycle-1' });
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'REVEAL_READY',
          revealAt: new Date(Date.now() - 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date(Date.now() - 11 * 60_000),
          participations: [],
        }),
        updateMany,
        update,
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
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              deleteMany: matchDeleteMany,
              create: matchCreate,
            },
            matchCycle: {
              update: matchCycleUpdate,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
    };
    const service = new CyclesService(prisma as never);
    const testHarness = service as unknown as Pick<
      CyclesServiceTestHarness,
      'toEligibleParticipants' | 'calculatePairs'
    >;
    const eligibleParticipantsSpy = jest
      .spyOn(testHarness, 'toEligibleParticipants')
      .mockReturnValue([
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
        },
      ]);
    const calculatePairsSpy = jest
      .spyOn(testHarness, 'calculatePairs')
      .mockResolvedValue({
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
      service.runRevealCycle({ force: true }),
    ).resolves.toMatchObject({
      ok: true,
      cycleId: 'cycle-1',
      createdMatches: 1,
      unmatchedCount: 0,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      data: { status: 'OPEN' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'cycle-1',
        status: 'OPEN',
      },
      data: {
        status: 'REVEAL_READY',
      },
    });
    expect(eligibleParticipantsSpy).toHaveBeenCalled();
    expect(calculatePairsSpy).toHaveBeenCalled();
    expect(matchDeleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
    expect(matchCreate).toHaveBeenCalledTimes(1);
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        adminActorId: undefined,
        action: 'cycle.revealed',
        metadata: {
          cycleId: 'cycle-1',
          createdMatches: 1,
          unmatchedCount: 0,
          forced: true,
        },
      },
    });
  });

  it('clears prior matches on force reveal and records cleared count in audit', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const matchDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
    const matchCycleUpdate = jest.fn().mockResolvedValue({ id: 'cycle-1' });
    const cycleParticipation = {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() - 60_000),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          participations: [],
        }),
        updateMany,
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
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            cycleParticipation,
            match: {
              deleteMany: matchDeleteMany,
              create: matchCreate,
            },
            matchCycle: {
              update: matchCycleUpdate,
            },
            auditLog: {
              create: auditLogCreate,
            },
          }),
      ),
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
        },
        answers: {},
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
        },
        answers: {},
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
      createdMatches: 1,
    });

    expect(matchDeleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
    expect(auditLogCreate).toHaveBeenCalledWith({
      data: {
        adminActorId: undefined,
        action: 'cycle.revealed',
        metadata: {
          cycleId: 'cycle-1',
          createdMatches: 1,
          unmatchedCount: 0,
          forced: true,
          clearedMatches: 2,
        },
      },
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
