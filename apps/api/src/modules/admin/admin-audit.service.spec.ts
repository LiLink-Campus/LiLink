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
});
