import { AdminService } from './admin.service';

describe('AdminService', () => {
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
          omit: { passwordHash: boolean };
          include: unknown;
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
      omit: { passwordHash: true },
      include: {
        school: true,
        profile: true,
        questionnaireResponse: true,
        participations: {
          orderBy: { createdAt: 'desc' },
          take: 3,
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

  it('caps the overview user list instead of loading every user', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'user-1' }]);
    const prisma = {
      school: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchCycle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany,
      },
      questionnaireVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      report: {
        findMany: jest.fn().mockResolvedValue([]),
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

    await service.getOverview();

    expect(findMany).toHaveBeenCalledWith({
      omit: { passwordHash: true },
      include: {
        school: true,
        profile: true,
        questionnaireResponse: true,
        participations: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  });
});
