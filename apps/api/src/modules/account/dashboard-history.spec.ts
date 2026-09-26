import {
  DASHBOARD_COUPON_READ_TARGET,
  DASHBOARD_COUPON_READ_VERSION,
} from '@lilink/shared';
import { DASHBOARD_COUPON_HREF } from '../coupon/coupon-read-state';
import {
  buildDashboardSnapshotRecord,
  buildHistoryMatchParticipant,
  buildRevealedCycle,
  createDashboardPrismaMock,
} from '../../../test/fixtures/account/account-dashboard.fixtures';
import { AccountDashboardService } from './account-dashboard.service';
import { createDashboardSnapshotServiceMock } from '../../../test/fixtures/account/account-snapshot.fixtures';
const ANY_DATE = expect.any(Date) as unknown as Date;
describe('AccountDashboardService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('returns three recent history items in reveal order', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountDashboardService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-3',
            status: 'OPTED_IN',
          },
          {
            cycleId: 'cycle-2',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-3',
            matchId: 'match-3',
            introducedAt: new Date('2026-04-03T13:00:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-3',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-3',
    });
    expect(dashboard.latestMatchVisibility).toBe('VISIBLE');
    expect(dashboard.latestMatchLimitedReason).toBeNull();
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-3',
      matched: true,
    });
    expect(dashboard.recentMatchHistory).toHaveLength(3);
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      cycleId: 'cycle-3',
      codename: '第三轮',
      participationStatus: 'OPTED_IN',
      result: 'MATCHED',
      visibility: 'VISIBLE',
      limitedReason: null,
      match: {
        id: 'match-3',
      },
    });
    expect(dashboard.recentMatchHistory[1]).toMatchObject({
      cycleId: 'cycle-2',
      participationStatus: 'OPTED_IN',
      result: 'UNMATCHED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      match: null,
    });
    expect(dashboard.recentMatchHistory[2]).toMatchObject({
      cycleId: 'cycle-1',
      participationStatus: 'OPTED_OUT',
      result: 'NOT_PARTICIPATED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      match: null,
    });
  });
  it('keeps latestMatch tied to the last revealed participation cycle', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-4', '第四轮', '2026-04-04T12:00:00.000Z'),
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
    ];
    const olderLatestCycle = buildRevealedCycle(
      'cycle-1',
      '第一轮',
      '2026-04-01T12:00:00.000Z',
    );
    const service = new AccountDashboardService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-4',
            status: 'OPTED_OUT',
          },
          {
            cycleId: 'cycle-3',
            status: 'OPTED_OUT',
          },
          {
            cycleId: 'cycle-2',
            status: 'OPTED_OUT',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            introducedAt: new Date('2026-04-01T13:00:00.000Z'),
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: olderLatestCycle,
        },
      }) as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
    });
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory).toHaveLength(3);
    expect(dashboard.recentMatchHistory.map((item) => item.cycleId)).toEqual([
      'cycle-4',
      'cycle-3',
      'cycle-2',
    ]);
  });
  it('uses the same revealed snapshot set for latest and recent dashboard history', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-4', '第四轮', '2026-04-04T12:00:00.000Z'),
      buildRevealedCycle('cycle-3', '第三轮', '2026-04-03T12:00:00.000Z'),
      buildRevealedCycle('cycle-2', '第二轮', '2026-04-02T12:00:00.000Z'),
    ];
    const prisma = createDashboardPrismaMock({
      revealedCycles,
      lastRevealedParticipation: {
        cycleId: 'cycle-1',
        status: 'OPTED_IN',
        cycle: buildRevealedCycle(
          'cycle-1',
          '第一轮',
          '2026-04-01T12:00:00.000Z',
        ),
      },
    });
    const service = new AccountDashboardService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );

    await service.getDashboard('user-1');

    expect(prisma.userCycleDashboardSnapshot.findFirst).not.toHaveBeenCalled();
    const [snapshotQuery] = prisma.userCycleDashboardSnapshot.findMany.mock
      .calls[0] as [Record<string, unknown>];
    expect(snapshotQuery.where).toEqual({
      userId: 'user-1',
      cycleId: { in: ['cycle-4', 'cycle-3', 'cycle-2', 'cycle-1'] },
    });
  });
  it('reuses complete snapshots and reads repaired history before returning', async () => {
    const cycle = buildRevealedCycle(
      'cycle-1',
      '第一轮',
      '2026-04-01T12:00:00.000Z',
    );
    const prisma = createDashboardPrismaMock({
      revealedCycles: [cycle],
      recentParticipations: [{ cycleId: cycle.id, status: 'OPTED_IN' }],
      recentMatches: [
        buildHistoryMatchParticipant({
          cycleId: cycle.id,
          matchId: 'match-1',
          introducedAt: cycle.revealAt,
        }),
      ],
    });
    const snapshots = createDashboardSnapshotServiceMock();
    const service = new AccountDashboardService(
      prisma as never,
      snapshots as never,
    );
    const warm = await service.getDashboard('user-1');
    expect(warm.latestMatch).toMatchObject({ id: 'match-1' });
    expect(prisma.userCycleDashboardSnapshot.findMany).toHaveBeenCalledTimes(1);
    expect(snapshots.ensureUserSnapshotCoverage).not.toHaveBeenCalled();

    prisma.userCycleDashboardSnapshot.findMany.mockResolvedValueOnce([]);
    snapshots.ensureUserSnapshotCoverage.mockResolvedValueOnce(true);
    const repaired = await service.getDashboard('user-1');
    expect(snapshots.ensureUserSnapshotCoverage).toHaveBeenCalledTimes(1);
    expect(repaired.latestMatch).toEqual(warm.latestMatch);
    expect(repaired.recentMatchHistory).toEqual(warm.recentMatchHistory);
  });
  it('skips repairs for unjoined rounds while preserving retained snapshots', async () => {
    const cycle = buildRevealedCycle(
      'cycle-1',
      '第一轮',
      '2026-04-01T12:00:00.000Z',
    );
    const prisma = createDashboardPrismaMock({ revealedCycles: [cycle] });
    const snapshots = createDashboardSnapshotServiceMock();
    const service = new AccountDashboardService(
      prisma as never,
      snapshots as never,
    );
    const empty = await service.getDashboard('user-1');
    expect(empty.recentMatchHistory[0].result).toBe('NOT_PARTICIPATED');
    expect(snapshots.ensureUserSnapshotCoverage).not.toHaveBeenCalled();

    prisma.userCycleDashboardSnapshot.findMany.mockResolvedValueOnce([
      buildDashboardSnapshotRecord({
        cycle,
        participationStatus: 'OPTED_IN',
        matchParticipant: null,
      }),
    ]);
    const retained = await service.getDashboard('user-1');
    expect(retained.recentMatchHistory[0].result).toBe('UNMATCHED');
    expect(snapshots.ensureUserSnapshotCoverage).not.toHaveBeenCalled();
  });
  it('includes dashboard coupon agenda read state and available count', async () => {
    const prisma = createDashboardPrismaMock({
      revealedCycles: [],
      availableCouponCount: 2,
    });
    const service = new AccountDashboardService(
      prisma as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.couponAgenda).toEqual({
      target: DASHBOARD_COUPON_READ_TARGET,
      version: DASHBOARD_COUPON_READ_VERSION,
      availableCount: 2,
      unreadAvailableCount: 2,
      read: false,
      readAt: null,
      href: DASHBOARD_COUPON_HREF,
    });
    expect(prisma.coupon.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: 'ISSUED',
        totpSecret: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: ANY_DATE } }],
      },
    });
  });
  it('limits reported history matches and keeps the match id for reuse', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountDashboardService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-1',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            reportStatus: 'OPEN',
          }),
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
      reportStatus: 'OPEN',
      reasons: [],
      participants: [],
    });
    expect(dashboard.latestMatchVisibility).toBe('LIMITED');
    expect(dashboard.latestMatchLimitedReason).toBe('REPORTED');
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      result: 'MATCHED',
      visibility: 'LIMITED',
      limitedReason: 'REPORTED',
      match: {
        id: 'match-1',
        reportStatus: 'OPEN',
        reasons: [],
        participants: [],
      },
    });
  });
  it('limits blocked history matches but still returns latestMatch with LIMITED visibility', async () => {
    const revealedCycles = [
      buildRevealedCycle('cycle-1', '第一轮', '2026-04-01T12:00:00.000Z'),
    ];
    const service = new AccountDashboardService(
      createDashboardPrismaMock({
        revealedCycles,
        recentParticipations: [
          {
            cycleId: 'cycle-1',
            status: 'OPTED_IN',
          },
        ],
        recentMatches: [
          buildHistoryMatchParticipant({
            cycleId: 'cycle-1',
            matchId: 'match-1',
            counterpartUserId: 'user-2',
          }),
        ],
        blocks: [
          {
            blockerId: 'user-1',
            blockedId: 'user-2',
          },
        ],
        lastRevealedParticipation: {
          cycleId: 'cycle-1',
          status: 'OPTED_IN',
          cycle: revealedCycles[0],
        },
      }) as never,
      createDashboardSnapshotServiceMock() as never,
    );

    const dashboard = await service.getDashboard('user-1');

    expect(dashboard.latestMatch).toMatchObject({
      id: 'match-1',
      reasons: [],
      participants: [],
    });
    expect(dashboard.latestMatchVisibility).toBe('LIMITED');
    expect(dashboard.latestMatchLimitedReason).toBe('BLOCKED');
    expect(dashboard.lastRevealedRound).toMatchObject({
      cycleId: 'cycle-1',
      matched: true,
    });
    expect(dashboard.recentMatchHistory[0]).toMatchObject({
      result: 'MATCHED',
      visibility: 'LIMITED',
      limitedReason: 'BLOCKED',
      match: {
        id: 'match-1',
        reasons: [],
        participants: [],
      },
    });
  });
});
