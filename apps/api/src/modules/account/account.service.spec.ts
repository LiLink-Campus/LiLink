import { BadRequestException } from '@nestjs/common';
import { AccountService } from './account.service';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';

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

function createDashboardPrismaMock({
  revealedCycles,
  recentParticipations = [],
  recentMatches = [],
  blocks = [],
  currentCycle = null,
  currentParticipation = null,
  lastRevealedParticipation = null,
  matchedInLastRevealedRound = null,
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
  matchedInLastRevealedRound?: { id: string } | null;
}) {
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
      findMany: jest.fn().mockResolvedValue(recentParticipations),
      findUnique: jest.fn().mockResolvedValue(currentParticipation),
    },
    matchParticipant: {
      findMany: jest.fn().mockResolvedValue(recentMatches),
      findFirst: jest.fn().mockResolvedValue(matchedInLastRevealedRound),
    },
    block: {
      findMany: jest.fn().mockResolvedValue(blocks),
    },
  };
}

describe('AccountService', () => {
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
      service.setParticipation('user-1', { optIn: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters stale questionnaire answers down to the current questionnaire keys', async () => {
    const service = new AccountService(
      {
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue({
            answers: {
              current_question: 'kept',
              removed_question: 'dropped',
              [HARD_MATCH_KEYS.birthDate]: '2000-05-10',
              [HARD_MATCH_KEYS.oneLinerIntro]:
                '测试用一句话介绍，用于回归问卷过滤。',
            },
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
        [HARD_MATCH_KEYS.oneLinerIntro]: '测试用一句话介绍，用于回归问卷过滤。',
      },
    });
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

  it('queries match participants only for dashboard-visible revealed cycles', async () => {
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

    expect(prisma.matchParticipant.findMany).toHaveBeenCalledTimes(1);
    const [query] = prisma.matchParticipant.findMany.mock.calls[0] as [
      Record<string, unknown>,
    ];

    expect(query).toHaveProperty('select');
    expect(query).not.toHaveProperty('include');
    expect(query.where).toEqual({
      userId: 'user-1',
      cycleId: {
        in: ['cycle-4', 'cycle-3', 'cycle-2', 'cycle-1'],
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
      $transaction: jest.fn().mockResolvedValue(undefined),
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
