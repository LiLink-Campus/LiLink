import { AdminService } from './admin.service';
import { BadRequestException } from '@nestjs/common';
import { clearStickyParticipationCache } from '../../common/participation/sticky-cycle-participation';

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
          notes: null,
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
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-2',
        status: 'OPTED_OUT',
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
});
