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
    race: string;
    partnerRaces: string[];
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
      message: 'Not enough complete participants to generate matches.',
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
          race: '黄种人',
          partnerRaces: ['黄种人'],
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
          race: '黄种人',
          partnerRaces: ['黄种人'],
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
    const matchCreate = jest.fn().mockResolvedValue({ id: 'match-1' });
    const auditLogCreate = jest.fn().mockResolvedValue(undefined);
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
        create: matchCreate,
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
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
            race: '黄种人',
            partnerRaces: ['黄种人'],
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
            race: '黄种人',
            partnerRaces: ['黄种人'],
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
});
