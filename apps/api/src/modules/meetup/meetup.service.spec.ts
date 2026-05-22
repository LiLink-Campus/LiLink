import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MeetupService } from './meetup.service';
import { locationCandidates } from './location-candidates';
import type {
  MeetupMatchRecord,
  MeetupOptionRecord,
  MeetupParticipantRecord,
  MeetupProposalRecord,
  MeetupSessionRecord,
  MeetupTransactionClient,
} from './types';

function createDelegate() {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    createManyAndReturn: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
  };
}

function createTx() {
  return {
    auditLog: createDelegate(),
    match: createDelegate(),
    matchParticipant: createDelegate(),
    meetupMessage: createDelegate(),
    meetupOption: createDelegate(),
    meetupParticipant: createDelegate(),
    meetupProposal: createDelegate(),
    meetupSession: createDelegate(),
    outboundEmail: createDelegate(),
    user: createDelegate(),
  };
}

function createService(tx: ReturnType<typeof createTx>) {
  const prisma = {
    $transaction: <T>(
      callback: (client: MeetupTransactionClient) => Promise<T>,
    ) => callback(tx),
  };
  const mailService = {
    buildMeetupReminderEmail: jest
      .fn()
      .mockImplementation(
        (input: {
          sessionId: string;
          recipientEmail: string;
          recipientDisplayName: string | null;
          otherPartyDisplayName: string | null;
          actionSentence: string;
          directUrl: string;
        }) => ({
          dedupeKey: `meetup-reminder:${input.sessionId}`,
          recipientEmail: input.recipientEmail,
          subject: 'LiLink 破冰会话待处理',
          html: `<a href="${input.directUrl}">open</a>`,
          text: input.actionSentence,
          messageCategory: 'TRANSACTIONAL',
        }),
      ),
    flushQueuedEmails: jest.fn().mockResolvedValue(undefined),
  };

  return {
    service: new MeetupService(prisma as never, mailService as never),
    mailService,
    prisma,
  };
}

function buildMatch(
  overrides: Partial<MeetupMatchRecord> = {},
): MeetupMatchRecord {
  return {
    id: 'match-1',
    introducedAt: new Date('2026-01-01T00:00:00.000Z'),
    revealedAt: new Date('2026-01-01T00:00:00.000Z'),
    participants: [
      {
        id: 'mp-a',
        matchId: 'match-1',
        userId: 'user-a',
        contactRequestedAt: null,
        user: {
          id: 'user-a',
          displayName: 'User A',
          meetupExpirationWeeks: 2,
        },
      },
      {
        id: 'mp-b',
        matchId: 'match-1',
        userId: 'user-b',
        contactRequestedAt: null,
        user: {
          id: 'user-b',
          displayName: 'User B',
          meetupExpirationWeeks: 1,
        },
      },
    ],
    ...overrides,
  };
}

function buildParticipant(
  overrides: Partial<MeetupParticipantRecord>,
): MeetupParticipantRecord {
  return {
    id: overrides.id ?? `participant-${overrides.userId ?? 'user'}`,
    sessionId: 'session-1',
    userId: overrides.userId ?? 'user-a',
    matchParticipantId: overrides.matchParticipantId ?? 'mp-a',
    turnState: overrides.turnState ?? 'NONE',
    responseRequiredAt: null,
    responseRequiredMessageId: null,
    revisionUsedAt: null,
    lastSeenAt: null,
    user: {
      id: overrides.userId ?? 'user-a',
      displayName: overrides.userId === 'user-b' ? 'User B' : 'User A',
    },
    ...overrides,
  };
}

function buildTimeOption(
  overrides: Partial<MeetupOptionRecord> = {},
): MeetupOptionRecord {
  return {
    id: 'time-1',
    proposalId: 'proposal-1',
    sessionId: 'session-1',
    kind: 'TIME',
    status: 'PENDING',
    startsAt: new Date('2026-05-15T10:00:00.000Z'),
    endsAt: new Date('2026-05-15T11:00:00.000Z'),
    toleranceMinutes: 10,
    locationCandidateId: null,
    placeName: null,
    latitude: null,
    longitude: null,
    createdAt: new Date('2026-05-14T10:00:00.000Z'),
    ...overrides,
  };
}

function buildLocationOption(
  overrides: Partial<MeetupOptionRecord> = {},
): MeetupOptionRecord {
  const candidate = locationCandidates[0];
  return {
    id: 'location-1',
    proposalId: 'proposal-1',
    sessionId: 'session-1',
    kind: 'LOCATION',
    status: 'PENDING',
    startsAt: null,
    endsAt: null,
    toleranceMinutes: 10,
    locationCandidateId: candidate.id,
    placeName: candidate.name,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    createdAt: new Date('2026-05-14T10:00:00.000Z'),
    ...overrides,
  };
}

function buildProposal(
  overrides: Partial<MeetupProposalRecord> = {},
): MeetupProposalRecord {
  return {
    id: 'proposal-1',
    sessionId: 'session-1',
    messageId: 'message-1',
    actorUserId: 'user-a',
    scope: 'BOTH',
    status: 'PENDING',
    createdAt: new Date('2026-05-14T10:00:00.000Z'),
    options: [buildTimeOption(), buildLocationOption()],
    ...overrides,
  };
}

function buildSession(
  overrides: Partial<MeetupSessionRecord> = {},
): MeetupSessionRecord {
  const proposal = overrides.currentProposal ?? buildProposal();

  return {
    id: 'session-1',
    matchId: 'match-1',
    status: 'ACTIVE',
    currentProposalId: proposal.id,
    currentProposal: proposal,
    confirmedTimeOptionId: null,
    confirmedTimeOption: null,
    confirmedLocationOptionId: null,
    confirmedLocationOption: null,
    finalConfirmRequiredByUserId: null,
    startedByUserId: 'user-a',
    canceledByUserId: null,
    cancelReason: null,
    cancelNote: null,
    reopenedFromLockedAt: null,
    reopenedFromLockedStartsAt: null,
    lockVersion: 0,
    lastActiveAt: new Date('2026-05-14T10:00:00.000Z'),
    effectiveExpirationWeeks: 1,
    expiresAt: new Date('2026-05-21T10:00:00.000Z'),
    archiveEligibleAt: null,
    lockedAt: null,
    canceledAt: null,
    expiredAt: null,
    archivedAt: null,
    createdAt: new Date('2026-05-14T10:00:00.000Z'),
    participants: [
      buildParticipant({
        id: 'meetup-participant-a',
        userId: 'user-a',
        matchParticipantId: 'mp-a',
        turnState: 'WAITING',
      }),
      buildParticipant({
        id: 'meetup-participant-b',
        userId: 'user-b',
        matchParticipantId: 'mp-b',
        turnState: 'REQUIRED',
      }),
    ],
    messages: [],
    ...overrides,
  };
}

function buildReminderCandidate(overrides: {
  sessionId?: string;
  participantId?: string;
  userId?: string;
  responseRequiredAt?: Date;
  responseRequiredMessageType?: string | null;
  finalConfirmRequiredByUserId?: string | null;
}) {
  const sessionId = overrides.sessionId ?? 'session-1';
  const userId = overrides.userId ?? 'user-b';

  return {
    id: overrides.participantId ?? `meetup-participant-${sessionId}`,
    userId,
    responseRequiredAt:
      overrides.responseRequiredAt ?? new Date('2026-05-13T09:59:00.000Z'),
    responseRequiredMessage:
      overrides.responseRequiredMessageType === null
        ? null
        : { type: overrides.responseRequiredMessageType ?? 'PROPOSE' },
    user: {
      email: `${userId}@example.com`,
      displayName: userId === 'user-b' ? 'User B' : 'User A',
    },
    session: {
      id: sessionId,
      matchId: 'match-1',
      finalConfirmRequiredByUserId:
        overrides.finalConfirmRequiredByUserId ?? null,
      participants: [
        {
          userId: 'user-a',
          user: {
            displayName: 'User A',
          },
        },
        {
          userId: 'user-b',
          user: {
            displayName: 'User B',
          },
        },
      ],
    },
  };
}

describe('MeetupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues one reminder email for a required turn after 24 hours', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({ sessionId: 'session-1' }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-1' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    const [[findManyArgs]] = tx.meetupParticipant.findMany.mock
      .calls as unknown as Array<
      [
        {
          where: {
            turnState: string;
            responseRequiredAt: { lte: Date };
            session: {
              is: {
                status: string;
                OR: Array<Record<string, unknown>>;
              };
            };
          };
        },
      ]
    >;
    expect(findManyArgs.where.turnState).toBe('REQUIRED');
    expect(findManyArgs.where.responseRequiredAt.lte).toEqual(
      new Date('2026-05-13T10:00:00.000Z'),
    );
    expect(findManyArgs.where.session.is.status).toBe('ACTIVE');
    expect(findManyArgs).toMatchObject({
      orderBy: [{ responseRequiredAt: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 50,
    });
    const [[reminderInput]] = mailService.buildMeetupReminderEmail.mock
      .calls as unknown as Array<
      [
        {
          sessionId: string;
          recipientEmail: string;
          recipientDisplayName: string | null;
          otherPartyDisplayName: string | null;
          actionSentence: string;
          directUrl: string;
        },
      ]
    >;
    expect(reminderInput).toMatchObject({
      sessionId: 'session-1',
      recipientEmail: 'user-b@example.com',
      recipientDisplayName: 'User B',
      otherPartyDisplayName: 'User A',
      actionSentence: 'User A 已经发出见面提议，正在等你确认。',
    });
    expect(reminderInput.directUrl).toMatch(/\/dashboard\/meetup\/session-1$/);
    expect(tx.outboundEmail.findMany).toHaveBeenCalledWith({
      where: {
        dedupeKey: {
          in: ['meetup-reminder:session-1'],
        },
      },
      select: {
        dedupeKey: true,
      },
    });
    expect(tx.outboundEmail.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: 'meetup-reminder:session-1',
          recipientEmail: 'user-b@example.com',
        }),
      ],
      skipDuplicates: true,
      select: {
        dedupeKey: true,
      },
    });
    expect(mailService.flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: ['meetup-reminder:session-1'],
    });
  });

  it('queues a partial accept reminder with matching action copy', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({
        sessionId: 'session-accept-partial',
        userId: 'user-a',
        responseRequiredMessageType: 'ACCEPT',
      }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-accept-partial' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    expect(mailService.buildMeetupReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-accept-partial',
        recipientEmail: 'user-a@example.com',
        otherPartyDisplayName: 'User B',
        actionSentence:
          'User B 已经接受了部分选项，正在等你继续处理这个破冰会话。',
      }),
    );
  });

  it('queues a final confirmation reminder with matching action copy', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({
        sessionId: 'session-final-confirm',
        userId: 'user-a',
        responseRequiredMessageType: 'ACCEPT',
        finalConfirmRequiredByUserId: 'user-a',
      }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-final-confirm' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    expect(mailService.buildMeetupReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-final-confirm',
        recipientEmail: 'user-a@example.com',
        otherPartyDisplayName: 'User B',
        actionSentence: 'User B 已经接受时间和地点，正在等你最终确认。',
      }),
    );
  });

  it('queues a rejection reminder with matching action copy', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({
        sessionId: 'session-reject',
        userId: 'user-a',
        responseRequiredMessageType: 'REJECT',
      }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-reject' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    expect(mailService.buildMeetupReminderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-reject',
        recipientEmail: 'user-a@example.com',
        otherPartyDisplayName: 'User B',
        actionSentence:
          'User B 已经拒绝这次见面提议，正在等你调整后重新发出提议。',
      }),
    );
  });

  it('skips required turns without a supported reminder message type', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({
        sessionId: 'session-unsupported',
        responseRequiredMessageType: null,
      }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 0,
    });

    expect(mailService.buildMeetupReminderEmail).not.toHaveBeenCalled();
    expect(tx.outboundEmail.createManyAndReturn).not.toHaveBeenCalled();
    expect(mailService.flushQueuedEmails).not.toHaveBeenCalled();
  });

  it('lets the reminder cron catch immediate flush failures after queueing emails', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    const flushError = new Error('flush failed');
    const loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({ sessionId: 'session-1' }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-1' },
    ]);
    mailService.flushQueuedEmails.mockRejectedValue(flushError);

    await expect(
      service.handleMeetupReminderEmailQueue(),
    ).resolves.toBeUndefined();

    expect(tx.outboundEmail.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: 'meetup-reminder:session-1',
        }),
      ],
      skipDuplicates: true,
      select: {
        dedupeKey: true,
      },
    });
    expect(mailService.flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: ['meetup-reminder:session-1'],
    });
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Failed to queue meetup reminder emails.',
      flushError.stack,
    );

    loggerErrorSpy.mockRestore();
  });

  it('does not flush when the session reminder was already queued', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({ sessionId: 'session-1' }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-1' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 0,
    });

    expect(tx.outboundEmail.createManyAndReturn).not.toHaveBeenCalled();
    expect(mailService.flushQueuedEmails).not.toHaveBeenCalled();
  });

  it('continues past an already queued full reminder batch', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    const existingCandidates = Array.from({ length: 50 }, (_, index) =>
      buildReminderCandidate({
        sessionId: `session-${index}`,
        participantId: `participant-${index}`,
      }),
    );
    const nextCandidate = buildReminderCandidate({
      sessionId: 'session-50',
      participantId: 'participant-50',
    });
    tx.meetupParticipant.findMany
      .mockResolvedValueOnce(existingCandidates)
      .mockResolvedValueOnce([nextCandidate]);
    tx.outboundEmail.findMany
      .mockResolvedValueOnce(
        existingCandidates.map((candidate) => ({
          dedupeKey: `meetup-reminder:${candidate.session.id}`,
        })),
      )
      .mockResolvedValueOnce([]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-50' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    const participantQueries = tx.meetupParticipant.findMany.mock
      .calls as unknown as Array<[{ skip: number; take: number }]>;
    expect(participantQueries[0]?.[0]).toMatchObject({ skip: 0, take: 50 });
    expect(participantQueries[1]?.[0]).toMatchObject({ skip: 50, take: 50 });
    expect(tx.outboundEmail.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: 'meetup-reminder:session-50',
        }),
      ],
      skipDuplicates: true,
      select: {
        dedupeKey: true,
      },
    });
    expect(mailService.flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: ['meetup-reminder:session-50'],
    });
  });

  it('returns only newly inserted reminder dedupe keys after partial dedupe', async () => {
    const tx = createTx();
    const { service, mailService } = createService(tx);
    tx.meetupParticipant.findMany.mockResolvedValue([
      buildReminderCandidate({ sessionId: 'session-existing' }),
      buildReminderCandidate({ sessionId: 'session-new' }),
    ]);
    tx.outboundEmail.findMany.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-existing' },
    ]);
    tx.outboundEmail.createManyAndReturn.mockResolvedValue([
      { dedupeKey: 'meetup-reminder:session-new' },
    ]);

    await expect(service.queueMeetupReminderEmails()).resolves.toEqual({
      queuedCount: 1,
    });

    expect(tx.outboundEmail.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: 'meetup-reminder:session-new',
        }),
      ],
      skipDuplicates: true,
      select: {
        dedupeKey: true,
      },
    });
    expect(mailService.flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: ['meetup-reminder:session-new'],
    });
  });

  it('rejects start before the match is introduced', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    tx.match.findUnique.mockResolvedValue(
      buildMatch({
        introducedAt: null,
      }),
    );

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: buildProposalInput(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects start when the match is not exactly two participants', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    tx.match.findUnique.mockResolvedValue(
      buildMatch({
        participants: [
          buildMatch().participants[0],
          buildMatch().participants[1],
          {
            id: 'mp-c',
            matchId: 'match-1',
            userId: 'user-c',
            contactRequestedAt: null,
            user: {
              id: 'user-c',
              displayName: 'User C',
              meetupExpirationWeeks: 2,
            },
          },
        ],
      }),
    );

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: buildProposalInput(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('starts a session with participants and server-side location snapshots', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const loadedSession = buildSession({
      currentProposal: buildProposal({
        id: 'proposal-created',
      }),
      currentProposalId: 'proposal-created',
    });

    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 1 },
    ]);
    tx.meetupSession.create.mockResolvedValue({ id: 'session-1' });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    const response = await service.startSession('user-a', 'match-1', {
      proposal: buildProposalInput(),
    });

    expect(response.id).toBe('session-1');
    const participantCreateCalls = tx.meetupParticipant.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{ userId: string; turnState: string }>;
        },
      ]
    >;
    const participantCreateInput = participantCreateCalls[0]?.[0] ?? {
      data: [],
    };
    expect(participantCreateInput.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'user-a',
          turnState: 'WAITING',
        }),
        expect.objectContaining({
          userId: 'user-b',
          turnState: 'REQUIRED',
        }),
      ]),
    );

    const optionCreateCalls = tx.meetupOption.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            kind: string;
            locationCandidateId?: string;
            placeName?: string;
            latitude?: number;
            longitude?: number;
          }>;
        },
      ]
    >;
    const optionCreateInput = optionCreateCalls[0]?.[0] ?? {
      data: [],
    };
    const candidate = locationCandidates[0];
    expect(optionCreateInput.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'LOCATION',
          locationCandidateId: candidate.id,
          placeName: candidate.name,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
        }),
      ]),
    );

    const sessionUpdateCalls = tx.meetupSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          data?: {
            currentProposalId?: string;
            effectiveExpirationWeeks?: number;
          };
        },
      ]
    >;
    const sessionUpdateInput = sessionUpdateCalls.find(
      ([input]) => input.data?.currentProposalId === 'proposal-created',
    )?.[0];
    expect(sessionUpdateInput?.data?.effectiveExpirationWeeks).toBe(1);
  });

  it('parses offsetless meetup time options as Beijing time', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const loadedSession = buildSession({
      currentProposal: buildProposal({
        id: 'proposal-created',
      }),
      currentProposalId: 'proposal-created',
    });

    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 1 },
    ]);
    tx.meetupSession.create.mockResolvedValue({ id: 'session-1' });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    const proposal = buildProposalInput();
    proposal.timeOptions = [
      {
        startsAt: '2026-05-15T18:00',
        endsAt: '2026-05-15T19:00',
      },
      {
        startsAt: '2026-05-16T18:30:15.250',
        endsAt: '2026-05-16T19:30:15.250',
      },
    ];

    await service.startSession('user-a', 'match-1', { proposal });

    const optionCreateCalls = tx.meetupOption.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            kind: string;
            startsAt?: Date;
            endsAt?: Date;
          }>;
        },
      ]
    >;
    const timeOptions =
      optionCreateCalls[0]?.[0].data.filter(
        (option) => option.kind === 'TIME',
      ) ?? [];

    expect(timeOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startsAt: new Date('2026-05-15T10:00:00.000Z'),
          endsAt: new Date('2026-05-15T11:00:00.000Z'),
        }),
        expect.objectContaining({
          startsAt: new Date('2026-05-16T10:30:15.250Z'),
          endsAt: new Date('2026-05-16T11:30:15.250Z'),
        }),
      ]),
    );
  });

  it('stores custom meetup locations as display-only place names', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const loadedSession = buildSession({
      currentProposal: buildProposal({
        id: 'proposal-created',
      }),
      currentProposalId: 'proposal-created',
    });

    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 1 },
    ]);
    tx.meetupSession.create.mockResolvedValue({ id: 'session-1' });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    const proposal = buildProposalInput();
    proposal.locationOptions = [
      { locationCandidateId: locationCandidates[0].id },
      { placeName: 'Library south entrance' },
    ];

    await service.startSession('user-a', 'match-1', { proposal });

    const optionCreateCalls = tx.meetupOption.createMany.mock
      .calls as unknown as Array<
      [
        {
          data: Array<{
            kind: string;
            locationCandidateId?: string | null;
            placeName?: string | null;
            latitude?: number | null;
            longitude?: number | null;
          }>;
        },
      ]
    >;
    const locationOptions =
      optionCreateCalls[0]?.[0].data.filter(
        (option) => option.kind === 'LOCATION',
      ) ?? [];

    expect(locationOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'LOCATION',
          locationCandidateId: null,
          placeName: 'Library south entrance',
          latitude: null,
          longitude: null,
        }),
      ]),
    );
  });

  it('accepts candidate-only location options shaped like ValidationPipe DTO output', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const loadedSession = buildSession({
      currentProposal: buildProposal({
        id: 'proposal-created',
      }),
      currentProposalId: 'proposal-created',
    });

    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupSession.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 1 },
    ]);
    tx.meetupSession.create.mockResolvedValue({ id: 'session-1' });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: {
          scope: 'LOCATION_ONLY',
          locationOptions: [
            {
              locationCandidateId: locationCandidates[0].id,
              placeName: undefined,
            },
            {
              locationCandidateId: locationCandidates[1].id,
              placeName: undefined,
            },
          ],
        },
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'session-1' }));
  });

  it('rejects location options that provide both candidate id and place name', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: {
          scope: 'LOCATION_ONLY',
          locationOptions: [
            {
              locationCandidateId: locationCandidates[0].id,
              placeName: 'Library south entrance',
            },
            { locationCandidateId: locationCandidates[1].id },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.match.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate location candidates before touching the database', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: {
          scope: 'LOCATION_ONLY',
          locationOptions: [
            { locationCandidateId: locationCandidates[0].id },
            { locationCandidateId: locationCandidates[0].id },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.match.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate custom meetup locations before touching the database', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: {
          scope: 'LOCATION_ONLY',
          locationOptions: [
            { placeName: 'Library south entrance' },
            { placeName: '  library   south entrance  ' },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.match.findUnique).not.toHaveBeenCalled();
  });

  it('rejects blank custom meetup locations before touching the database', async () => {
    const tx = createTx();
    const { service } = createService(tx);

    await expect(
      service.startSession('user-a', 'match-1', {
        proposal: {
          scope: 'LOCATION_ONLY',
          locationOptions: [
            { placeName: 'Library south entrance' },
            { placeName: '   ' },
          ],
        },
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.match.findUnique).not.toHaveBeenCalled();
  });

  it('converges expired active sessions on read and clears turns', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const expiredSession = buildSession({
      expiresAt: new Date('2026-05-14T09:59:00.000Z'),
    });
    const loadedExpiredSession = buildSession({
      status: 'EXPIRED',
      currentProposalId: null,
      currentProposal: null,
      expiresAt: null,
      expiredAt: new Date('2026-05-14T10:00:00.000Z'),
      participants: expiredSession.participants.map((participant) => ({
        ...participant,
        turnState: 'NONE',
      })),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(expiredSession)
      .mockResolvedValueOnce(loadedExpiredSession);
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupProposal.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupOption.updateMany.mockResolvedValue({ count: 2 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({});
    tx.match.findUnique.mockResolvedValue(buildMatch());

    const response = await service.getSession('user-a', 'session-1');

    expect(response.status).toBe('EXPIRED');
    const sessionUpdateCalls = tx.meetupSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          data: {
            status: string;
            currentProposalId: string | null;
            finalConfirmRequiredByUserId: string | null;
          };
        },
      ]
    >;
    const sessionUpdateInput = sessionUpdateCalls[0]?.[0];
    expect(sessionUpdateInput?.data).toMatchObject({
      status: 'EXPIRED',
      currentProposalId: null,
      finalConfirmRequiredByUserId: null,
    });

    const participantUpdateCalls = tx.meetupParticipant.updateMany.mock
      .calls as unknown as Array<[{ data: { turnState: string } }]>;
    const participantUpdateInput = participantUpdateCalls[0]?.[0];
    expect(participantUpdateInput?.data.turnState).toBe('NONE');
  });

  it('does not converge expired sessions before participant authorization', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const expiredSession = buildSession({
      expiresAt: new Date('2026-05-14T09:59:00.000Z'),
    });

    tx.meetupSession.findUnique.mockResolvedValueOnce(expiredSession);

    await expect(
      service.getSession('user-outside', 'session-1'),
    ).rejects.toThrow(NotFoundException);
    expect(tx.meetupSession.updateMany).not.toHaveBeenCalled();
    expect(tx.meetupParticipant.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('reports ordinary active cancellation as available after the confirmed start time', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const confirmedTime = buildTimeOption({
      id: 'time-confirmed',
      status: 'CONFIRMED',
      startsAt: new Date('2026-05-14T09:00:00.000Z'),
      endsAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    const confirmedLocation = buildLocationOption({
      id: 'location-confirmed',
      status: 'CONFIRMED',
    });
    const session = buildSession({
      currentProposalId: null,
      currentProposal: null,
      confirmedTimeOptionId: confirmedTime.id,
      confirmedTimeOption: confirmedTime,
      confirmedLocationOptionId: confirmedLocation.id,
      confirmedLocationOption: confirmedLocation,
      finalConfirmRequiredByUserId: 'user-a',
      reopenedFromLockedStartsAt: null,
      expiresAt: new Date('2026-05-21T10:00:00.000Z'),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);

    const response = await service.getSession('user-a', 'session-1');

    expect(response.availableActions.cancel).toEqual({
      enabled: true,
      reason: null,
    });
  });

  it('accepts both dimensions and returns the turn to the proposer for final confirmation', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const proposal = buildProposal({
      actorUserId: 'user-a',
      options: [
        buildTimeOption({ id: 'time-1' }),
        buildTimeOption({ id: 'time-2' }),
        buildLocationOption({ id: 'location-1' }),
        buildLocationOption({ id: 'location-2' }),
      ],
    });
    const session = buildSession({
      currentProposal: proposal,
      currentProposalId: proposal.id,
    });
    const acceptedSession = buildSession({
      currentProposal: null,
      currentProposalId: null,
      confirmedTimeOptionId: 'time-1',
      confirmedTimeOption: buildTimeOption({
        id: 'time-1',
        status: 'CONFIRMED',
      }),
      confirmedLocationOptionId: 'location-1',
      confirmedLocationOption: buildLocationOption({
        id: 'location-1',
        status: 'CONFIRMED',
      }),
      finalConfirmRequiredByUserId: 'user-a',
      participants: [
        buildParticipant({
          id: 'meetup-participant-a',
          userId: 'user-a',
          matchParticipantId: 'mp-a',
          turnState: 'REQUIRED',
        }),
        buildParticipant({
          id: 'meetup-participant-b',
          userId: 'user-b',
          matchParticipantId: 'mp-b',
          turnState: 'WAITING',
        }),
      ],
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(acceptedSession);
    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupMessage.create.mockResolvedValue({ id: 'accept-message' });
    tx.meetupOption.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 2 },
    ]);
    tx.meetupProposal.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    const response = await service.acceptOptions('user-b', 'session-1', {
      timeOptionId: 'time-1',
      locationOptionId: 'location-1',
    });

    expect(response.progressStatus).toBe('AWAITING_FINAL_CONFIRMATION');
    expect(response.userTurnStatus).toBe('WAITING_FOR_COUNTERPART');
    const sessionUpdateCalls = tx.meetupSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          data?: {
            confirmedTimeOptionId?: string;
            confirmedLocationOptionId?: string;
            finalConfirmRequiredByUserId?: string;
            currentProposalId?: string | null;
          };
        },
      ]
    >;
    const sessionUpdateInput = sessionUpdateCalls.find(
      ([input]) => input.data?.confirmedTimeOptionId === 'time-1',
    )?.[0];
    expect(sessionUpdateInput?.data).toMatchObject({
      confirmedTimeOptionId: 'time-1',
      confirmedLocationOptionId: 'location-1',
      finalConfirmRequiredByUserId: 'user-a',
      currentProposalId: null,
    });
  });

  it('claims an active session before creating a proposal', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const session = buildSession({
      currentProposalId: null,
      currentProposal: null,
      participants: [
        buildParticipant({
          id: 'meetup-participant-a',
          userId: 'user-a',
          matchParticipantId: 'mp-a',
          turnState: 'REQUIRED',
        }),
        buildParticipant({
          id: 'meetup-participant-b',
          userId: 'user-b',
          matchParticipantId: 'mp-b',
          turnState: 'WAITING',
        }),
      ],
    });
    const loadedSession = buildSession({
      currentProposalId: 'proposal-created',
      currentProposal: buildProposal({
        id: 'proposal-created',
        messageId: 'message-created',
        actorUserId: 'user-a',
      }),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 2 },
    ]);
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupOption.createMany.mockResolvedValue({ count: 4 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    await service.createProposal('user-a', 'session-1', buildProposalInput());

    expect(
      tx.meetupSession.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.meetupProposal.create.mock.invocationCallOrder[0]);
    const sessionUpdateCalls = tx.meetupSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where?: Record<string, unknown>;
          data?: Record<string, unknown>;
        },
      ]
    >;
    const claimInput = sessionUpdateCalls[0]?.[0];
    expect(claimInput).toMatchObject({
      where: {
        id: 'session-1',
        status: 'ACTIVE',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
      },
      data: {
        lastActiveAt: new Date('2026-05-14T10:00:00.000Z'),
      },
    });
    const linkInput = sessionUpdateCalls[1]?.[0];
    expect(linkInput).toMatchObject({
      data: {
        currentProposalId: 'proposal-created',
      },
    });
  });

  it('maps a pending proposal race during proposal creation to a stale proposal conflict', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const session = buildSession({
      currentProposalId: null,
      currentProposal: null,
      participants: [
        buildParticipant({
          id: 'meetup-participant-a',
          userId: 'user-a',
          matchParticipantId: 'mp-a',
          turnState: 'REQUIRED',
        }),
        buildParticipant({
          id: 'meetup-participant-b',
          userId: 'user-b',
          matchParticipantId: 'mp-b',
          turnState: 'WAITING',
        }),
      ],
    });
    const uniqueError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 2 },
    ]);
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockRejectedValue(uniqueError);

    const result = service.createProposal(
      'user-a',
      'session-1',
      buildProposalInput(),
    );

    await expect(result).rejects.toThrow(ConflictException);
    await expect(result).rejects.toThrow('MEETUP_STALE_PROPOSAL');
  });

  it('claims a locked session before creating a revision proposal', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const confirmedTime = buildTimeOption({
      id: 'time-confirmed',
      status: 'CONFIRMED',
      startsAt: new Date('2026-05-15T10:00:00.000Z'),
      endsAt: new Date('2026-05-15T11:00:00.000Z'),
    });
    const confirmedLocation = buildLocationOption({
      id: 'location-confirmed',
      status: 'CONFIRMED',
    });
    const lockedSession = buildSession({
      status: 'LOCKED',
      currentProposalId: null,
      currentProposal: null,
      confirmedTimeOptionId: confirmedTime.id,
      confirmedTimeOption: confirmedTime,
      confirmedLocationOptionId: confirmedLocation.id,
      confirmedLocationOption: confirmedLocation,
      lockedAt: new Date('2026-05-14T09:00:00.000Z'),
      expiresAt: null,
      archiveEligibleAt: new Date('2026-05-16T10:00:00.000Z'),
      participants: [
        buildParticipant({
          id: 'meetup-participant-a',
          userId: 'user-a',
          matchParticipantId: 'mp-a',
          turnState: 'NONE',
        }),
        buildParticipant({
          id: 'meetup-participant-b',
          userId: 'user-b',
          matchParticipantId: 'mp-b',
          turnState: 'NONE',
        }),
      ],
    });
    const loadedSession = buildSession({
      currentProposalId: 'proposal-created',
      currentProposal: buildProposal({
        id: 'proposal-created',
        messageId: 'message-created',
        actorUserId: 'user-a',
      }),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(lockedSession)
      .mockResolvedValueOnce(lockedSession)
      .mockResolvedValueOnce(loadedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 2 },
    ]);
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockResolvedValue({ id: 'proposal-created' });
    tx.meetupOption.createMany.mockResolvedValue({ count: 4 });
    tx.auditLog.create.mockResolvedValue({});

    await service.reviseAfterLock('user-a', 'session-1', {
      proposal: buildProposalInput(),
    });

    expect(
      tx.meetupSession.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(tx.meetupProposal.create.mock.invocationCallOrder[0]);
    const sessionUpdateCalls = tx.meetupSession.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where?: Record<string, unknown>;
          data?: Record<string, unknown>;
        },
      ]
    >;
    const claimInput = sessionUpdateCalls[0]?.[0];
    expect(claimInput).toMatchObject({
      where: {
        id: 'session-1',
        status: 'LOCKED',
        currentProposalId: null,
        finalConfirmRequiredByUserId: null,
      },
      data: {
        status: 'ACTIVE',
        currentProposalId: null,
        reopenedFromLockedStartsAt: confirmedTime.startsAt,
      },
    });
    const linkInput = sessionUpdateCalls[1]?.[0];
    expect(linkInput).toMatchObject({
      data: {
        currentProposalId: 'proposal-created',
      },
    });
  });

  it('maps a pending proposal race during locked revision to a stale proposal conflict', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const confirmedTime = buildTimeOption({
      id: 'time-confirmed',
      status: 'CONFIRMED',
      startsAt: new Date('2026-05-15T10:00:00.000Z'),
      endsAt: new Date('2026-05-15T11:00:00.000Z'),
    });
    const confirmedLocation = buildLocationOption({
      id: 'location-confirmed',
      status: 'CONFIRMED',
    });
    const lockedSession = buildSession({
      status: 'LOCKED',
      currentProposalId: null,
      currentProposal: null,
      confirmedTimeOptionId: confirmedTime.id,
      confirmedTimeOption: confirmedTime,
      confirmedLocationOptionId: confirmedLocation.id,
      confirmedLocationOption: confirmedLocation,
      lockedAt: new Date('2026-05-14T09:00:00.000Z'),
      expiresAt: null,
      archiveEligibleAt: new Date('2026-05-16T10:00:00.000Z'),
      participants: [
        buildParticipant({
          id: 'meetup-participant-a',
          userId: 'user-a',
          matchParticipantId: 'mp-a',
          turnState: 'NONE',
        }),
        buildParticipant({
          id: 'meetup-participant-b',
          userId: 'user-b',
          matchParticipantId: 'mp-b',
          turnState: 'NONE',
        }),
      ],
    });
    const uniqueError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(lockedSession)
      .mockResolvedValueOnce(lockedSession);
    tx.user.findMany.mockResolvedValue([
      { id: 'user-a', meetupExpirationWeeks: 2 },
      { id: 'user-b', meetupExpirationWeeks: 2 },
    ]);
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupMessage.create.mockResolvedValue({ id: 'message-created' });
    tx.meetupProposal.create.mockRejectedValue(uniqueError);

    const result = service.reviseAfterLock('user-a', 'session-1', {
      proposal: buildProposalInput(),
    });

    await expect(result).rejects.toThrow(ConflictException);
    await expect(result).rejects.toThrow('MEETUP_STALE_PROPOSAL');
  });

  it('allows ordinary active cancellation after the confirmed start time', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const confirmedTime = buildTimeOption({
      id: 'time-confirmed',
      status: 'CONFIRMED',
      startsAt: new Date('2026-05-14T09:00:00.000Z'),
      endsAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    const confirmedLocation = buildLocationOption({
      id: 'location-confirmed',
      status: 'CONFIRMED',
    });
    const session = buildSession({
      currentProposalId: null,
      currentProposal: null,
      confirmedTimeOptionId: confirmedTime.id,
      confirmedTimeOption: confirmedTime,
      confirmedLocationOptionId: confirmedLocation.id,
      confirmedLocationOption: confirmedLocation,
      finalConfirmRequiredByUserId: 'user-a',
    });
    const canceledSession = buildSession({
      ...session,
      status: 'CANCELED',
      canceledByUserId: 'user-a',
      cancelReason: 'USER_CANCELED',
      canceledAt: new Date('2026-05-14T10:00:00.000Z'),
      expiresAt: null,
      finalConfirmRequiredByUserId: null,
      participants: session.participants.map((participant) => ({
        ...participant,
        turnState: 'NONE',
      })),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(canceledSession);
    tx.meetupMessage.create.mockResolvedValue({ id: 'cancel-message' });
    tx.meetupSession.updateMany.mockResolvedValue({ count: 1 });
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({});

    const response = await service.cancel('user-a', 'session-1', {});

    expect(response.status).toBe('CANCELED');
    expect(tx.meetupMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        actorUserId: 'user-a',
        type: 'CANCEL',
        noteText: undefined,
      },
    });
    expect(tx.meetupSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CANCELED',
          canceledByUserId: 'user-a',
        }) as object,
      }),
    );
  });

  it('rejects locked cancellation after the confirmed start time', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const confirmedTime = buildTimeOption({
      id: 'time-confirmed',
      status: 'CONFIRMED',
      startsAt: new Date('2026-05-14T09:00:00.000Z'),
      endsAt: new Date('2026-05-14T10:00:00.000Z'),
    });
    const confirmedLocation = buildLocationOption({
      id: 'location-confirmed',
      status: 'CONFIRMED',
    });
    const session = buildSession({
      status: 'LOCKED',
      currentProposalId: null,
      currentProposal: null,
      confirmedTimeOptionId: confirmedTime.id,
      confirmedTimeOption: confirmedTime,
      confirmedLocationOptionId: confirmedLocation.id,
      confirmedLocationOption: confirmedLocation,
      expiresAt: null,
      archiveEligibleAt: new Date('2026-05-14T11:00:00.000Z'),
    });

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);

    await expect(service.cancel('user-a', 'session-1', {})).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.meetupMessage.create).not.toHaveBeenCalled();
    expect(tx.meetupSession.updateMany).not.toHaveBeenCalled();
  });

  it('marks seen without touching session activity state', async () => {
    const tx = createTx();
    const { service } = createService(tx);
    const session = buildSession();

    tx.meetupSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(session);
    tx.match.findUnique.mockResolvedValue(buildMatch());
    tx.meetupParticipant.updateMany.mockResolvedValue({ count: 1 });
    tx.auditLog.create.mockResolvedValue({});

    await service.markSeen('user-a', 'session-1');

    expect(tx.meetupParticipant.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'meetup-participant-a',
      },
      data: {
        lastSeenAt: new Date('2026-05-14T10:00:00.000Z'),
      },
    });
    expect(tx.meetupSession.updateMany).not.toHaveBeenCalled();
  });
});

function buildProposalInput(): {
  scope: 'BOTH';
  timeOptions: Array<{ startsAt: string; endsAt: string }>;
  locationOptions: Array<
    { locationCandidateId: string } | { placeName: string }
  >;
} {
  return {
    scope: 'BOTH',
    timeOptions: [
      {
        startsAt: '2026-05-15T10:00:00.000Z',
        endsAt: '2026-05-15T11:00:00.000Z',
      },
      {
        startsAt: '2026-05-15T12:00:00.000Z',
        endsAt: '2026-05-15T13:00:00.000Z',
      },
    ],
    locationOptions: [
      { locationCandidateId: locationCandidates[0].id },
      { locationCandidateId: locationCandidates[1].id },
    ],
  };
}
