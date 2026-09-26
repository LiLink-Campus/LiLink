import { createDashboardPrismaMock } from '../../../test/fixtures/account/account-dashboard.fixtures';
import { AccountDashboardService } from './account-dashboard.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
describe('AccountDashboardService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('treats a missing current-cycle participation as opted out on dashboard load', async () => {
    const prisma = createDashboardPrismaMock({
      revealedCycles: [],
      currentCycle: {
        id: 'cycle-2',
        codename: 'Round 2',
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        participationDeadline: new Date('2026-04-30T12:00:00.000Z'),
        status: 'OPEN',
      },
      currentParticipation: null,
    });
    const service = new AccountDashboardService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      currentCycle: {
        id: 'cycle-2',
        participationStatus: 'OPTED_OUT',
        intent: null,
      },
    });
  });
  it('exposes the saved weekly intent on the dashboard payload', async () => {
    const prisma = createDashboardPrismaMock({
      revealedCycles: [],
      currentCycle: {
        id: 'cycle-3',
        codename: 'Round 3',
        revealAt: new Date('2026-05-08T12:00:00.000Z'),
        participationDeadline: new Date('2026-05-07T12:00:00.000Z'),
        status: 'OPEN',
      },
      currentParticipation: { status: 'OPTED_IN', intent: 'BOTH' },
    });
    const service = new AccountDashboardService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await expect(service.getDashboard('user-1')).resolves.toMatchObject({
      currentCycle: {
        id: 'cycle-3',
        participationStatus: 'OPTED_IN',
        intent: 'BOTH',
      },
    });
  });
});
