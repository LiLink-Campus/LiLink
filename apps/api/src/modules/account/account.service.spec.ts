import { BadRequestException } from '@nestjs/common';
import { AccountService } from './account.service';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';

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

  it('hides the latest match when the counterpart is blocked', async () => {
    const service = new AccountService(
      {
        userProfile: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        questionnaireResponse: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
        matchCycle: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        matchParticipant: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'participant-1',
              contactRequestedAt: null,
              match: {
                id: 'match-1',
                score: 82,
                reasons: ['reason'],
                introducedAt: '2026-04-01T00:00:00.000Z',
                reports: [],
                participants: [
                  {
                    userId: 'user-1',
                    contactRequestedAt: null,
                    user: {
                      email: 'user-1@example.com',
                      displayName: 'User 1',
                      profile: { headline: 'hello' },
                      school: { name: 'School A' },
                    },
                  },
                  {
                    userId: 'user-2',
                    contactRequestedAt: null,
                    user: {
                      email: 'user-2@example.com',
                      displayName: 'User 2',
                      profile: { headline: 'world' },
                      school: { name: 'School B' },
                    },
                  },
                ],
              },
            },
          ]),
        },
        block: {
          findMany: jest.fn().mockResolvedValue([
            {
              blockerId: 'user-1',
              blockedId: 'user-2',
            },
          ]),
        },
        cycleParticipation: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as never,
      {} as never,
      {} as never,
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      latestMatch: null,
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
