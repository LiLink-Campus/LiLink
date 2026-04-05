import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import { CyclesService } from './cycles.service';

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
  ) => { score: number; reasons: string[] } | null;
  toEligibleParticipants: (
    participations: unknown[],
  ) => EligibleParticipantStub[];
  calculatePairs: (
    participants: EligibleParticipantStub[],
    questions: unknown[],
    revealAt: Date,
  ) => Promise<{
    candidates: CandidatePairStub[];
    selectedPairs: CandidatePairStub[];
  }>;
};

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
  it('rejects running a cycle before reveal time by default', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          participations: [],
        }),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.runRevealCycle()).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows an explicit internal force run before reveal time', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() + 60_000),
          participations: [],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'questionnaire-1',
          questions: [],
        }),
      },
    };
    const service = new CyclesService(prisma as never);

    await expect(service.runRevealCycle({ force: true })).resolves.toEqual({
      ok: true,
      message:
        'Not enough complete participants to generate matches. No users are opted in (OPTED_IN) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers are required.',
    });
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
      score: 66,
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
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'REVEAL_READY',
          revealAt: new Date(Date.now() - 60_000),
          updatedAt: new Date(Date.now() - 11 * 60_000),
          participations: [],
        }),
        updateMany,
        update,
      },
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
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
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
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          status: 'OPEN',
          revealAt: new Date(Date.now() - 60_000),
          participations: [],
        }),
        updateMany,
      },
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
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
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

    expect(result.selectedPairs).toEqual([
      {
        left: expect.objectContaining({ id: 'user-a' }),
        right: expect.objectContaining({ id: 'user-b' }),
        score: 78,
        reasons: [
          '你们对进入关系的期待很一致。',
          '你们都把 真诚、稳定 放在重要位置。',
        ],
      },
      {
        left: expect.objectContaining({ id: 'user-c' }),
        right: expect.objectContaining({ id: 'user-d' }),
        score: 78,
        reasons: [
          '你们对进入关系的期待很一致。',
          '你们都把 幽默感、上进 放在重要位置。',
        ],
      },
    ]);
  });

  it('excludes blocked and previously matched pairs before choosing the final result set', async () => {
    const prisma = {
      block: {
        findMany: jest.fn().mockResolvedValue([
          { blockerId: 'user-a', blockedId: 'user-b' },
        ]),
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
    expect(result.selectedPairs).toEqual([
      {
        left: expect.objectContaining({ id: 'user-b' }),
        right: expect.objectContaining({ id: 'user-c' }),
        score: 72,
        reasons: [
          '你们对进入关系的期待很一致。',
          '你们都把 真诚 放在重要位置。',
        ],
      },
    ]);
  });
});
