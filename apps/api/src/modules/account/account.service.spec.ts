import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AccountService } from './account.service';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';

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

function createDashboardPrismaMock({
  revealedCycles,
  recentParticipations = [],
  recentMatches = [],
  blocks = [],
  currentCycle = null,
  currentParticipation = null,
  lastRevealedParticipation = null,
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
    status: 'DRAFT' | 'OPEN' | 'REVEAL_READY' | 'REVEALED';
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

describe('AccountService', () => {
  afterEach(() => {
    clearStickyParticipationCache();
  });

  it('rejects participation changes after the deadline', async () => {
    const prisma = {
      matchCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          participationDeadline: new Date(Date.now() - 60_000),
        }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
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
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ status: 'SUSPENDED' }),
      },
    };
    const service = new AccountService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.setParticipation('user-1', { optIn: true, intent: 'BOTH' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { status: true },
    });
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
          participationDeadline: new Date(Date.now() + 60_000),
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
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
            answers: {
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
            submittedAt: new Date('2026-04-18T12:00:00.000Z'),
          }),
        },
      } as never,
      {} as never,
      {
        getCurrentVersion: jest.fn().mockResolvedValue({
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
        sanitizeStoredAnswers: jest.fn().mockReturnValue({
          current_question: 'kept',
        }),
      } as never,
    );

    await expect(service.getQuestionnaire('user-1')).resolves.toEqual({
      answers: {
        current_question: 'kept',
        [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
        [HARD_MATCH_KEYS.school]: 'school-cuc',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-bupt'],
        [HARD_MATCH_KEYS.oneLinerIntro]: '测试用一句话介绍，用于回归问卷过滤。',
      },
      submittedAt: '2026-04-18T12:00:00.000Z',
      draft: null,
    });
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
          draftAnswers: {},
          submittedAt: expect.any(Date) as unknown as Date,
        }) as object,
        update: expect.objectContaining({
          answers: {
            [HARD_MATCH_KEYS.school]: 'school-bupt',
            current_question: 'kept',
          },
          draftAnswers: {},
          submittedAt: expect.any(Date) as unknown as Date,
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
    expect(submittedOperations).toHaveLength(1);
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
    );

    await expect(
      service.saveQuestionnaire('user-1', {
        displayName: 'A',
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
    expect(createdDraftPayload.displayName).toBe('A');
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
    expect(updatedDraftPayload.displayName).toBe('A');
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

  it('queries dashboard snapshots only for dashboard-visible revealed cycles', async () => {
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
    );

    await service.getDashboard('user-1');

    expect(prisma.userCycleDashboardSnapshot.findMany).toHaveBeenCalledTimes(1);
    const [query] = prisma.userCycleDashboardSnapshot.findMany.mock
      .calls[0] as [Record<string, unknown>];

    expect(query.where).toEqual({
      userId: 'user-1',
      cycleId: {
        in: ['cycle-4', 'cycle-3', 'cycle-2'],
      },
    });
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
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      currentCycle: {
        id: 'cycle-3',
        participationStatus: 'OPTED_IN',
        intent: 'BOTH',
      },
    });
  });

  it('queues introduction emails instead of rolling back the match state', async () => {
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
    const mailService = {
      buildIntroductionEmails: jest.fn().mockReturnValue(queuedEmails),
      flushQueuedEmails: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      matchParticipant: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'participant-1',
          userId: 'user-1',
          match: {
            id: 'match-1',
            introducedAt: null,
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
        }),
      },
      block: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({
          match: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          matchParticipant: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    );

    await expect(service.requestContact('user-1', 'match-1')).resolves.toEqual({
      ok: true,
    });
    expect(createMany).toHaveBeenCalledWith({
      data: queuedEmails,
    });
    expect(mailService.flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: [
        'match-introduction:match-1:requester',
        'match-introduction:match-1:recipient',
      ],
    });
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
              report: {
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
    const service = new AccountService(
      prisma as never,
      {
        buildIntroductionEmails: jest.fn(),
        flushQueuedEmails: jest.fn(),
      } as never,
      {} as never,
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
  });
});
