import { DashboardSnapshotService } from './dashboard-snapshot.service';

describe('DashboardSnapshotService', () => {
  it('wraps whole-cycle snapshot rebuilds in a transaction when no store is provided', async () => {
    const tx = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Cycle 1',
          revealAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'REVEALED',
        }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'user-1',
            status: 'OPTED_OUT',
          },
        ]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      userCycleDashboardSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (store: typeof tx) => Promise<void>) => callback(tx),
      ),
    };
    const service = new DashboardSnapshotService(prisma as never);

    await service.syncCycleSnapshots('cycle-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.matchCycle.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.userCycleDashboardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
    expect(tx.userCycleDashboardSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it('reuses the provided store instead of opening a nested transaction', async () => {
    const store = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Cycle 1',
          revealAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'REVEALED',
        }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      block: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      matchParticipant: {
        findMany: jest.fn(),
      },
      userCycleDashboardSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(),
    };
    const service = new DashboardSnapshotService(prisma as never);

    await service.syncCycleSnapshots('cycle-1', store as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(store.matchCycle.findUnique).toHaveBeenCalledTimes(1);
    expect(store.userCycleDashboardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
  });

  it('clears cycle snapshots when the cycle is no longer revealed', async () => {
    const store = {
      matchCycle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          codename: 'Cycle 1',
          revealAt: new Date('2026-04-01T00:00:00.000Z'),
          status: 'OPEN',
        }),
      },
      cycleParticipation: {
        findMany: jest.fn(),
      },
      match: {
        findMany: jest.fn(),
      },
      block: {
        findMany: jest.fn(),
      },
      userCycleDashboardSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn(),
      },
    };
    const service = new DashboardSnapshotService({} as never);

    await service.syncCycleSnapshots('cycle-1', store as never);

    expect(store.userCycleDashboardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { cycleId: 'cycle-1' },
    });
    expect(store.cycleParticipation.findMany).not.toHaveBeenCalled();
    expect(store.userCycleDashboardSnapshot.create).not.toHaveBeenCalled();
  });

  it('removes unrevealed match snapshots instead of upserting them', async () => {
    const store = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'match-1',
          cycleId: 'cycle-1',
          score: 88,
          reasons: ['reason'],
          reason: 'reason',
          conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
          introducedAt: null,
          revealedAt: null,
          cycle: {
            id: 'cycle-1',
            codename: 'Cycle 1',
            revealAt: new Date('2026-04-01T00:00:00.000Z'),
          },
          reports: [],
          participants: [
            {
              userId: 'user-1',
              contactRequestedAt: null,
              user: {
                email: 'user-1@example.com',
                displayName: 'User 1',
                profile: { headline: 'hello' },
                school: { name: 'School A' },
                questionnaireResponse: null,
              },
            },
            {
              userId: 'user-2',
              contactRequestedAt: null,
              user: {
                email: 'user-2@example.com',
                displayName: 'User 2',
                profile: { headline: 'world' },
                school: { name: 'School B' },
                questionnaireResponse: null,
              },
            },
          ],
        }),
      },
      cycleParticipation: {
        findMany: jest.fn(),
      },
      block: {
        findMany: jest.fn(),
      },
      userCycleDashboardSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        upsert: jest.fn(),
      },
    };
    const service = new DashboardSnapshotService({} as never);

    await service.syncMatchSnapshots('match-1', store as never);

    expect(store.userCycleDashboardSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        cycleId: 'cycle-1',
        userId: {
          in: ['user-1', 'user-2'],
        },
      },
    });
    expect(store.cycleParticipation.findMany).not.toHaveBeenCalled();
    expect(store.userCycleDashboardSnapshot.upsert).not.toHaveBeenCalled();
  });
});
