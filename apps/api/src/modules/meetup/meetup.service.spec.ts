import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    user: createDelegate(),
  };
}

function createService(tx: ReturnType<typeof createTx>) {
  const prisma = {
    $transaction: <T>(
      callback: (client: MeetupTransactionClient) => Promise<T>,
    ) => callback(tx as unknown as MeetupTransactionClient),
  };

  return {
    service: new MeetupService(prisma as never),
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

describe('MeetupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-14T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
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
    const claimInput = tx.meetupSession.updateMany.mock.calls[0]?.[0];
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
    const linkInput = tx.meetupSession.updateMany.mock.calls[1]?.[0];
    expect(linkInput).toMatchObject({
      data: {
        currentProposalId: 'proposal-created',
      },
    });
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
    const claimInput = tx.meetupSession.updateMany.mock.calls[0]?.[0];
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
    const linkInput = tx.meetupSession.updateMany.mock.calls[1]?.[0];
    expect(linkInput).toMatchObject({
      data: {
        currentProposalId: 'proposal-created',
      },
    });
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
        }),
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
  locationOptions: Array<{ locationCandidateId: string }>;
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
