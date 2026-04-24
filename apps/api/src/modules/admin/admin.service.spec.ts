import { AdminService } from './admin.service';
import { BadRequestException } from '@nestjs/common';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';
import { HARD_MATCH_KEYS } from '../questionnaire/hard-match';

describe('AdminService', () => {
  afterEach(() => {
    clearStickyParticipationCache();
  });

  it('forwards cycle id and admin actor id when manually running a cycle', async () => {
    const prisma = {};
    const cyclesService = {
      runRevealCycle: jest.fn().mockResolvedValue({ ok: true }),
    };
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn(),
    };
    const service = new AdminService(
      prisma as never,
      cyclesService as never,
      adminAuditService as never,
      {} as never,
    );

    await service.runCycle(
      {
        cycleId: 'cycle-1',
        force: true,
      },
      'admin-1',
    );

    expect(cyclesService.runRevealCycle).toHaveBeenCalledWith({
      cycleId: 'cycle-1',
      force: true,
      adminActorId: 'admin-1',
    });
  });

  it('uses the full open report count while still returning a capped preview list', async () => {
    const prisma = {
      school: {
        count: jest.fn().mockResolvedValue(3),
      },
      matchCycle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      report: {
        findMany: jest.fn().mockResolvedValue([{ id: 'report-1' }]),
        count: jest.fn().mockResolvedValue(27),
      },
      user: {
        count: jest.fn().mockResolvedValue(42),
      },
      questionnaireResponse: {
        count: jest.fn().mockResolvedValue(18),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(service.getDashboard()).resolves.toMatchObject({
      metrics: {
        schools: 3,
        activeUsers: 42,
        completedQuestionnaires: 18,
        openReports: 27,
      },
      openReports: [{ id: 'report-1' }],
    });
  });

  it('uses full report counts in the risk profile while keeping preview lists capped', async () => {
    const prisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'report-1',
          reporterId: 'reporter-1',
          reportedUserId: 'reported-1',
          matchId: null,
          reason: 'Spam',
          details: null,
          status: 'OPEN',
          adminNotes: null,
          handledAt: null,
          createdBlock: false,
          createdAt: new Date('2026-04-15T12:00:00.000Z'),
          reporter: {
            id: 'reporter-1',
            email: 'reporter@example.com',
            displayName: 'Reporter',
            status: 'ACTIVE',
            school: null,
            profile: null,
          },
          reportedUser: {
            id: 'reported-1',
            email: 'reported@example.com',
            displayName: 'Reported User',
            status: 'ACTIVE',
            school: null,
            profile: null,
            reportsReceived: Array.from({ length: 10 }, (_, index) => ({
              id: `received-${index}`,
              status: index < 4 ? 'OPEN' : 'RESOLVED',
            })),
            reportsFiled: Array.from({ length: 10 }, (_, index) => ({
              id: `filed-${index}`,
              status: 'OPEN',
            })),
          },
          match: null,
        }),
        count: jest
          .fn()
          .mockResolvedValueOnce(14)
          .mockResolvedValueOnce(11)
          .mockResolvedValueOnce(9)
          .mockResolvedValueOnce(5),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([{ id: 'block-1' }]),
      },
    };
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest
        .fn()
        .mockResolvedValue([{ id: 'log-1' }]),
      write: jest.fn(),
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
    );

    await expect(service.getReportContext('report-1')).resolves.toMatchObject({
      riskProfile: {
        reportedUserStatus: 'ACTIVE',
        receivedReportCount: 14,
        filedReportCount: 11,
        resolvedReportCount: 9,
        openReportCount: 5,
        mutualBlocks: [{ id: 'block-1' }],
      },
      logs: [{ id: 'log-1' }],
    });

    expect(prisma.report.count).toHaveBeenNthCalledWith(1, {
      where: {
        reportedUserId: 'reported-1',
      },
    });
    expect(prisma.report.count).toHaveBeenNthCalledWith(2, {
      where: {
        reporterId: 'reported-1',
      },
    });
    expect(prisma.report.count).toHaveBeenNthCalledWith(3, {
      where: {
        reportedUserId: 'reported-1',
        status: 'RESOLVED',
      },
    });
    expect(prisma.report.count).toHaveBeenNthCalledWith(4, {
      where: {
        reportedUserId: 'reported-1',
        status: 'OPEN',
      },
    });
  });

  it('initializes sticky participation records when creating an open cycle', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
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
            status: 'OPTED_OUT',
            updatedAt: new Date('2026-04-11T12:00:00.000Z'),
          },
        ]),
      createMany,
    };
    const prisma = {
      matchCycle: {
        create: jest.fn().mockResolvedValue({
          id: 'cycle-2',
          codename: 'Round 2',
          participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
          revealAt: new Date('2026-05-01T12:00:00.000Z'),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          status: 'OPEN',
          notes: null,
        }),
      },
      cycleParticipation,
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        Promise.resolve(fn({ cycleParticipation })),
      ),
    };
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn(),
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'OPEN',
        },
        'admin-1',
      ),
    ).resolves.toMatchObject({
      id: 'cycle-2',
      status: 'OPEN',
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
    expect(createManyArgument.data).toEqual([
      {
        cycleId: 'cycle-2',
        userId: 'user-1',
        status: 'OPTED_IN',
        intent: 'BOTH',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-2',
        status: 'OPTED_OUT',
        intent: null,
        optedInAt: null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
    expect(adminAuditService.write).toHaveBeenCalledWith(
      'admin-1',
      'cycle.created',
      {
        cycleId: 'cycle-2',
        status: 'OPEN',
      },
    );
  });

  it('rejects manually setting the internal PREPARING cycle status', async () => {
    const prisma = {
      matchCycle: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'PREPARING' as never,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.matchCycle.create).not.toHaveBeenCalled();
    expect(prisma.matchCycle.update).not.toHaveBeenCalled();
  });

  it('rejects creating an already revealed cycle from the admin form', async () => {
    const prisma = {
      matchCycle: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEALED',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.matchCycle.create).not.toHaveBeenCalled();
    expect(prisma.matchCycle.update).not.toHaveBeenCalled();
  });

  it('rejects creating a reveal-ready cycle from the admin form', async () => {
    const prisma = {
      matchCycle: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEAL_READY',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.matchCycle.create).not.toHaveBeenCalled();
    expect(prisma.matchCycle.update).not.toHaveBeenCalled();
  });

  it('rejects manually marking an open cycle as reveal-ready from the admin form', async () => {
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({ status: 'OPEN' }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          cycleId: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEAL_READY',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.matchCycle.findUnique).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      select: { status: true },
    });
    expect(prisma.matchCycle.create).not.toHaveBeenCalled();
    expect(prisma.matchCycle.update).not.toHaveBeenCalled();
  });

  it('rejects manually revealing an unrevealed cycle from the admin form', async () => {
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({ status: 'REVEAL_READY' }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          cycleId: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEALED',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.matchCycle.findUnique).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      select: { status: true },
    });
    expect(prisma.matchCycle.create).not.toHaveBeenCalled();
    expect(prisma.matchCycle.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      currentStatus: 'REVEAL_READY',
      requestedStatus: 'OPEN',
    },
    {
      currentStatus: 'REVEALED',
      requestedStatus: 'DRAFT',
    },
  ] as const)(
    'rejects reopening a $currentStatus cycle as $requestedStatus from the admin form',
    async ({ currentStatus, requestedStatus }) => {
      const prisma = {
        matchCycle: {
          findUnique: jest.fn().mockResolvedValue({ status: currentStatus }),
          create: jest.fn(),
          update: jest.fn(),
        },
      };
      const service = new AdminService(
        prisma as never,
        { runRevealCycle: jest.fn() } as never,
        {
          listAuditLogs: jest.fn(),
          getRecentAuditLogsByCondition: jest.fn(),
          write: jest.fn(),
        } as never,
        {} as never,
      );

      await expect(
        service.upsertCycle(
          {
            cycleId: 'cycle-1',
            codename: 'Round 2',
            participationDeadline: '2026-04-30T12:00:00.000Z',
            revealAt: '2026-05-01T12:00:00.000Z',
            status: requestedStatus,
          },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.matchCycle.findUnique).toHaveBeenCalledWith({
        where: { id: 'cycle-1' },
        select: { status: true },
      });
      expect(prisma.matchCycle.create).not.toHaveBeenCalled();
      expect(prisma.matchCycle.update).not.toHaveBeenCalled();
    },
  );

  it('allows saving an already reveal-ready cycle without changing preparation state', async () => {
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({ status: 'REVEAL_READY' }),
        update: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
          revealAt: new Date('2026-05-01T12:00:00.000Z'),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          status: 'REVEAL_READY',
          notes: 'updated notes',
        }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            cycleParticipation: {
              findMany: jest.fn().mockResolvedValue([]),
              createMany: jest.fn(),
            },
          }),
        ),
      ),
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          cycleId: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEAL_READY',
          notes: 'updated notes',
        },
        'admin-1',
      ),
    ).resolves.toMatchObject({
      id: 'cycle-1',
      status: 'REVEAL_READY',
      notes: 'updated notes',
    });

    expect(prisma.matchCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      data: {
        codename: 'Round 2',
        participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        status: 'REVEAL_READY',
        notes: 'updated notes',
      },
    });
    expect(adminAuditService.write).toHaveBeenCalledWith(
      'admin-1',
      'cycle.updated',
      {
        cycleId: 'cycle-1',
        status: 'REVEAL_READY',
      },
    );
  });

  it('allows saving an already revealed cycle without changing reveal state', async () => {
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn(),
    };
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({ status: 'REVEALED' }),
        update: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
          revealAt: new Date('2026-05-01T12:00:00.000Z'),
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          status: 'REVEALED',
          notes: 'updated notes',
        }),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
    );

    await expect(
      service.upsertCycle(
        {
          cycleId: 'cycle-1',
          codename: 'Round 2',
          participationDeadline: '2026-04-30T12:00:00.000Z',
          revealAt: '2026-05-01T12:00:00.000Z',
          status: 'REVEALED',
          notes: 'updated notes',
        },
        'admin-1',
      ),
    ).resolves.toMatchObject({
      id: 'cycle-1',
      status: 'REVEALED',
      notes: 'updated notes',
    });

    expect(prisma.matchCycle.update).toHaveBeenCalledWith({
      where: { id: 'cycle-1' },
      data: {
        codename: 'Round 2',
        participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        status: 'REVEALED',
        notes: 'updated notes',
      },
    });
    expect(adminAuditService.write).toHaveBeenCalledWith(
      'admin-1',
      'cycle.updated',
      {
        cycleId: 'cycle-1',
        status: 'REVEALED',
      },
    );
  });

  it('loads cycle detail without backfilling participation rows', async () => {
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Round 1',
          revealAt: new Date('2026-05-01T12:00:00.000Z'),
          participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
          status: 'OPEN',
          notes: null,
          createdAt: new Date('2026-04-20T12:00:00.000Z'),
          updatedAt: new Date('2026-04-20T12:00:00.000Z'),
          _count: {
            participations: 8,
            matches: 3,
          },
        }),
      },
      cycleParticipation: {
        count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(4),
      },
      match: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(service.getCycleDetail('cycle-1')).resolves.toMatchObject({
      cycle: {
        id: 'cycle-1',
      },
      summary: {
        participationCount: 8,
        matchableParticipantCount: 5,
        submittedQuestionnaireCount: 4,
        matchedPairCount: 3,
        reportedMatchCount: 1,
        pendingContactCount: 2,
      },
    });

    expect(prisma.cycleParticipation.count).toHaveBeenNthCalledWith(1, {
      where: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        intent: { not: null },
        user: {
          status: 'ACTIVE',
        },
      },
    });
  });

  it('loads cycle participants without backfilling participation rows', async () => {
    const prisma = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'participation-1',
            status: 'OPTED_IN',
            intent: 'DATE',
            optedInAt: new Date('2026-04-21T12:00:00.000Z'),
            updatedAt: new Date('2026-04-21T12:00:00.000Z'),
            user: {
              id: 'user-1',
              email: 'user-1@example.com',
              status: 'ACTIVE',
              displayName: 'User 1',
              isTest: false,
              createdAt: new Date('2026-04-01T12:00:00.000Z'),
              school: null,
              profile: null,
              questionnaireResponse: null,
            },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.getCycleParticipants('cycle-1', { page: 1, pageSize: 10 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: 'participation-1',
          status: 'OPTED_IN',
          intent: 'DATE',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
  });

  it('treats users with an unsubmitted questionnaire response as missing', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      user: {
        findMany,
        count,
      },
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await service.getUsers({
      page: 1,
      pageSize: 12,
      questionnaire: 'missing',
    });

    const findManyCalls = findMany.mock.calls as Array<
      [
        {
          where: unknown;
          select: unknown;
          orderBy: unknown;
          skip: number;
          take: number;
        },
      ]
    >;
    const findManyArguments = findManyCalls[0][0];

    expect(findManyArguments).toEqual({
      where: {
        AND: [
          {
            OR: [
              { questionnaireResponse: { is: null } },
              { questionnaireResponse: { is: { submittedAt: null } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        status: true,
        displayName: true,
        isTest: true,
        createdAt: true,
        school: {
          select: {
            name: true,
          },
        },
        profile: {
          select: {
            fullName: true,
            headline: true,
            bio: true,
            schoolYear: true,
            programName: true,
          },
        },
        questionnaireResponse: {
          select: {
            submittedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 12,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { questionnaireResponse: { is: null } },
              { questionnaireResponse: { is: { submittedAt: null } } },
            ],
          },
        ],
      },
    });
  });

  it('rejects a multi-select limit that is larger than the option count', async () => {
    const service = new AdminService(
      {
        questionnaireVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'version-1' }),
        },
      } as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertQuestion(
        {
          key: 'values',
          prompt: 'Values',
          type: 'MULTI_SELECT',
          selectionLimit: 4,
          options: [{ label: '真诚' }, { label: '稳定' }, { label: '幽默感' }],
          order: 1,
          weight: 1,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects setting a selection limit on a non-multi-select question', async () => {
    const service = new AdminService(
      {
        questionnaireVersion: {
          findFirst: jest.fn().mockResolvedValue({ id: 'version-1' }),
        },
      } as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(
      service.upsertQuestion(
        {
          key: 'pace',
          prompt: 'Pace',
          type: 'SINGLE_SELECT',
          selectionLimit: 2,
          options: [
            { label: '慢热' },
            { label: '平衡' },
            { label: '主动推进' },
          ],
          order: 1,
          weight: 1,
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns questionnaire answers with the canonical school id', async () => {
    const service = new AdminService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            schoolId: 'school-cuc',
            questionnaireResponse: {
              submittedAt: new Date('2026-04-15T12:00:00.000Z'),
              answers: {
                [HARD_MATCH_KEYS.school]: 'school-bupt',
                [HARD_MATCH_KEYS.excludedPartnerSchools]: [
                  'school-bupt',
                  'school-deleted',
                ],
              },
            },
          }),
        },
        school: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'school-bupt' }, { id: 'school-cuc' }]),
        },
      } as never,
      { runRevealCycle: jest.fn() } as never,
      {
        listAuditLogs: jest.fn(),
        getRecentAuditLogsByCondition: jest.fn(),
        write: jest.fn(),
      } as never,
      {} as never,
    );

    await expect(service.getUserQuestionnaire('user-1')).resolves.toEqual({
      submittedAt: new Date('2026-04-15T12:00:00.000Z'),
      answers: {
        [HARD_MATCH_KEYS.school]: 'school-cuc',
        [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-bupt'],
      },
    });
  });

  it('syncs questionnaire school answers when an admin reassigns the user school', async () => {
    const questionnaireResponse = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'response-1',
        answers: {
          [HARD_MATCH_KEYS.school]: 'school-bupt',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: [
            'school-bupt',
            'school-deleted',
          ],
        },
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const userUpdate = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User 1',
      schoolId: 'school-cuc',
      status: 'ACTIVE',
      isTest: false,
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
      updatedAt: new Date('2026-04-15T12:00:00.000Z'),
    });
    const schoolDelegate = {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'school-bupt' }, { id: 'school-cuc' }]),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          schoolId: 'school-bupt',
        }),
        update: userUpdate,
      },
      school: schoolDelegate,
      questionnaireResponse,
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            user: {
              update: userUpdate,
            },
            school: schoolDelegate,
            questionnaireResponse,
          }),
        ),
      ),
    };
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn(),
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
    );

    await service.updateUser('user-1', { schoolId: 'school-cuc' }, 'admin-1');

    expect(questionnaireResponse.update).toHaveBeenCalledWith({
      where: { id: 'response-1' },
      data: {
        answers: {
          [HARD_MATCH_KEYS.school]: 'school-cuc',
          [HARD_MATCH_KEYS.excludedPartnerSchools]: ['school-bupt'],
        },
      },
    });
    expect(adminAuditService.write).toHaveBeenCalledWith(
      'admin-1',
      'user.updated',
      {
        userId: 'user-1',
        fields: ['schoolId'],
      },
    );
  });

  it('rebuilds affected cycle snapshots after deleting test users', async () => {
    const syncCycleSnapshots = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'test-user-1', email: 'seed-1@example.com' },
          { id: 'test-user-2', email: 'seed-2@example.com' },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      matchParticipant: {
        findMany: jest.fn().mockResolvedValue([{ matchId: 'match-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([{ cycleId: 'cycle-1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      report: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      cycleParticipation: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      block: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionnaireResponse: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      userProfile: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      auditLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    const adminAuditService = {
      listAuditLogs: jest.fn(),
      getRecentAuditLogsByCondition: jest.fn(),
      write: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminService(
      prisma as never,
      { runRevealCycle: jest.fn() } as never,
      adminAuditService as never,
      {} as never,
      {
        syncCycleSnapshots,
        syncMatchSnapshots: jest.fn(),
        syncUserMatchSnapshots: jest.fn(),
      } as never,
    );

    await expect(service.deleteAllTestUsers('admin-1')).resolves.toEqual({
      ok: true,
      deletedCount: 2,
    });

    expect(prisma.match.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['match-1'] } },
      select: { cycleId: true },
      distinct: ['cycleId'],
    });
    expect(syncCycleSnapshots).toHaveBeenCalledWith('cycle-1');
    expect(adminAuditService.write).toHaveBeenCalledWith(
      'admin-1',
      'users.test_deleted',
      {
        count: 2,
        emails: ['seed-1@example.com', 'seed-2@example.com'],
      },
    );
  });
});
