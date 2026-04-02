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
});
