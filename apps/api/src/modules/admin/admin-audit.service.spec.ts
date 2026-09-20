import { Prisma } from '../../common/prisma/client';
import { AdminAuditService } from './admin-audit.service';

describe('AdminAuditService', () => {
  it('serializes admin actors in the audit log list', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-1',
            action: 'cycle.revealed',
            createdAt: new Date('2026-04-01T12:00:00.000Z'),
            metadata: { cycleId: 'cycle-1' },
            actor: null,
            adminActor: {
              email: 'ops@example.com',
              displayName: 'Ops',
            },
          },
        ]),
      },
    };
    const service = new AdminAuditService(prisma as never);

    await expect(service.listAuditLogs()).resolves.toEqual([
      {
        id: 'log-1',
        action: 'cycle.revealed',
        createdAt: new Date('2026-04-01T12:00:00.000Z'),
        metadata: { cycleId: 'cycle-1' },
        actor: {
          kind: 'admin',
          email: 'ops@example.com',
          displayName: 'Ops',
          school: null,
        },
      },
    ]);
  });

  it('writes admin actor ids into audit records', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      auditLog: {
        create,
      },
    };
    const service = new AdminAuditService(prisma as never);

    await service.write('admin-1', 'school.created', {
      schoolId: 'school-1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        adminActorId: 'admin-1',
        action: 'school.created',
        metadata: {
          schoolId: 'school-1',
        },
      },
    });
  });

  it('serializes user actors with optional school metadata', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-user',
            action: 'profile.updated',
            createdAt: new Date('2026-04-02T12:00:00.000Z'),
            metadata: null,
            actor: {
              email: 'student@example.com',
              displayName: 'Student',
              school: { name: 'Example University' },
            },
            adminActor: null,
          },
        ]),
      },
    };
    const service = new AdminAuditService(prisma as never);

    await expect(service.listAuditLogs()).resolves.toEqual([
      expect.objectContaining({
        id: 'log-user',
        actor: {
          kind: 'user',
          email: 'student@example.com',
          displayName: 'Student',
          school: { name: 'Example University' },
        },
      }),
    ]);
  });

  it('paginates audit logs when list parameters are present without search text', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      auditLog: {
        findMany,
        count,
      },
    };
    const service = new AdminAuditService(prisma as never);

    await expect(
      service.listAuditLogs({ page: 2, pageSize: 15, action: 'cycle.run' }),
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 2,
      pageSize: 15,
      totalPages: 1,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'cycle.run' },
        skip: 15,
        take: 15,
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { action: 'cycle.run' } });
  });

  it('filters the central audit list by cycle without requiring search text', async () => {
    const prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminAuditService(prisma as never);
    await service.listAuditLogs({
      cycleId: 'cycle-1',
      action: 'cycle.previewed',
    });
    const where = {
      action: 'cycle.previewed',
      metadata: { path: ['cycleId'], equals: 'cycle-1' },
    };
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where });
  });

  it('keeps cycle and action restrictions in both search and total queries', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: 0n }]),
      auditLog: { findMany: jest.fn() },
    };
    const service = new AdminAuditService(prisma as never);
    await service.listAuditLogs({
      cycleId: 'cycle-1',
      action: 'cycle.previewed',
      search: 'needle',
    });
    for (const [sql] of prisma.$queryRaw.mock.calls as Array<[Prisma.Sql]>) {
      expect(sql.sql).toContain(`"metadata"->>'cycleId'`);
      expect(sql.values).toEqual(
        expect.arrayContaining(['cycle-1', 'cycle.previewed', '%needle%']),
      );
    }
  });

  it('runs ILIKE search SQL and hydrates rows by id order', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'second' }, { id: 'first' }])
      .mockResolvedValueOnce([{ total: 2n }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'first',
        action: 'note',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        metadata: null,
        actor: null,
        adminActor: null,
      },
      {
        id: 'second',
        action: 'note',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        metadata: null,
        actor: null,
        adminActor: null,
      },
    ]);
    const prisma = {
      $queryRaw: queryRaw,
      auditLog: {
        findMany,
        count: jest.fn(),
      },
    };
    const service = new AdminAuditService(prisma as never);

    const page = await service.listAuditLogs({
      page: 1,
      pageSize: 10,
      search: '  needle  ',
    });

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['second', 'first'] } },
      }),
    );
    const items = page.items as Array<{ id: string }>;
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('second');
    expect(items[1]?.id).toBe('first');
    expect(page.total).toBe(2);
  });

  it('returns an empty hydrated list when search finds no ids', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0n }]);
    const findMany = jest.fn();
    const prisma = {
      $queryRaw: queryRaw,
      auditLog: { findMany, count: jest.fn() },
    };
    const service = new AdminAuditService(prisma as never);

    const page = await service.listAuditLogs({
      page: 1,
      pageSize: 10,
      search: 'missing',
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('loads recent audit logs by SQL condition', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: 'r1' }]);
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'r1',
        action: 'y',
        createdAt: new Date(),
        metadata: null,
        actor: null,
        adminActor: null,
      },
    ]);
    const service = new AdminAuditService({
      $queryRaw: queryRaw,
      auditLog: { findMany },
    } as never);

    const rows = await service.getRecentAuditLogsByCondition(
      Prisma.sql`TRUE`,
      3,
    );

    expect(rows).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
