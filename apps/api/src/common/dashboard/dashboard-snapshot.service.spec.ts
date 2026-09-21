import { Prisma } from '../prisma/client';
import { DashboardSnapshotService } from './dashboard-snapshot.service';

type DashboardSnapshotUpsertArg = {
  where: { userId_cycleId: { userId: string; cycleId: string } };
  create: {
    matchPayload: {
      participants: Array<{
        userId: string;
        email: string | null;
        contact: { type: string; label: string; value: string } | null;
      }>;
    };
  };
};

describe('DashboardSnapshotService', () => {
  it('returns only the current dashboard contract from historical snapshot JSON', () => {
    const service = new DashboardSnapshotService({} as never);
    const requestedAt = '2026-04-01T12:30:00.000Z';
    const stored = {
      id: 'historical-match',
      score: 88,
      introducedAt: requestedAt,
      currentUserRequestedAt: requestedAt,
      reportStatus: null,
      participants: [
        {
          userId: 'historical-user',
          displayName: 'Historical user',
          introLine: null,
          email: null,
          contact: {
            type: 'WECHAT',
            label: '微信',
            value: 'historical_wechat',
          },
          schoolName: null,
          contactRequestedAt: requestedAt,
        },
      ],
    };

    const result = service.readDashboardMatchPayload(stored);

    expect(result).toEqual({
      id: stored.id,
      score: stored.score,
      introducedAt: requestedAt,
      reportStatus: null,

      participants: [
        {
          userId: 'historical-user',
          displayName: 'Historical user',
          introLine: null,
          email: null,
          contact: stored.participants[0].contact,
          schoolName: null,
          gender: null,
          partnerGenders: [],
          weeklyIntent: null,
        },
      ],
    });
    expect(stored.currentUserRequestedAt).toBe(requestedAt);
    expect(stored.participants[0].contactRequestedAt).toBe(requestedAt);
  });

  it.each([null, undefined])(
    'hides cached pairs without an introduction timestamp (%s)',
    (introducedAt) => {
      const service = new DashboardSnapshotService({} as never);
      const stored = {
        id: 'skipped-match',
        score: 88,
        ...(introducedAt === null ? { introducedAt } : {}),
        participants: [
          {
            userId: 'suspended-user',
            email: 'private@example.test',
            contact: { type: 'WECHAT', label: '微信', value: 'private_wechat' },
          },
        ],
      };

      const result = service.readDashboardMatchPayload(stored);

      expect(result).toBeNull();
      expect(JSON.stringify(result)).not.toContain('private');
      expect(stored.participants[0].contact.value).toBe('private_wechat');
    },
  );

  it('wraps whole-cycle snapshot rebuilds in a transaction when no store is provided', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    expect(tx.userCycleDashboardSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          userId: 'user-1',
          cycleId: 'cycle-1',
        }) as object,
      ],
      skipDuplicates: true,
    });
  });

  it('reuses the provided store instead of opening a nested transaction', async () => {
    const store = {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      $queryRaw: jest.fn().mockResolvedValue([]),
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
        createMany: jest.fn(),
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

  it('skips snapshot rereads when known missing cycles were never joined', async () => {
    const prisma = {
      userCycleDashboardSnapshot: { findMany: jest.fn() },
      cycleParticipation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DashboardSnapshotService(prisma as never);
    await expect(
      service.ensureUserSnapshotCoverage({
        userId: 'user-1',
        recentRevealedCycleIds: ['cycle-1', 'cycle-2'],
        existingSnapshotCycleIds: ['cycle-1'],
      }),
    ).resolves.toBe(false);
    expect(prisma.userCycleDashboardSnapshot.findMany).not.toHaveBeenCalled();
    expect(prisma.cycleParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          cycleId: { in: ['cycle-2'] },
          cycle: { status: 'REVEALED' },
        },
      }),
    );
  });

  it('batches missing coverage without replacing existing snapshots', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
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
          { userId: 'user-1', status: 'OPTED_IN' },
          { userId: 'user-2', status: 'OPTED_OUT' },
          { userId: 'user-3', status: 'OPTED_OUT' },
        ]),
      },
      match: { findMany: jest.fn().mockResolvedValue([]) },
      block: { findMany: jest.fn().mockResolvedValue([]) },
      userCycleDashboardSnapshot: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'user-2' }]),
        deleteMany: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (store: typeof tx) => Promise<void>) => callback(tx),
      ),
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([{ cycleId: 'cycle-1' }]),
      },
    };
    const service = new DashboardSnapshotService(prisma as never);
    await service.ensureUserSnapshotCoverage({
      userId: 'user-1',
      recentRevealedCycleIds: ['cycle-1'],
      existingSnapshotCycleIds: [],
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.userCycleDashboardSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.userCycleDashboardSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ userId: 'user-1' }),
        expect.objectContaining({ userId: 'user-3' }),
      ],
      skipDuplicates: true,
    });
  });

  it.each([false, true])(
    'coalesces 100 cold readers behind a full rebuild (rebuild failed: %s)',
    async (rebuildFails) => {
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const prisma = {
        $transaction: jest.fn(
          async (callback: (store: unknown) => Promise<void>) => callback({}),
        ),
        cycleParticipation: {
          findMany: jest.fn().mockResolvedValue([{ cycleId: 'cycle-1' }]),
        },
      };
      const service = new DashboardSnapshotService(prisma as never);
      const methods = service as unknown as {
        syncCycleSnapshotsDirect(
          cycleId: string,
          store: unknown,
          onlyIfMissing?: boolean,
        ): Promise<void>;
      };
      const direct = jest
        .spyOn(methods, 'syncCycleSnapshotsDirect')
        .mockImplementation(async (_cycle, _store, onlyIfMissing) => {
          if (onlyIfMissing) return;
          await barrier;
          if (rebuildFails) throw new Error('Simulated rebuild failure');
        });
      const rebuild = service
        .syncCycleSnapshots('cycle-1')
        .catch((error: unknown) => error);
      const coverage = Array.from({ length: 100 }, (_, index) =>
        service.ensureUserSnapshotCoverage({
          userId: `user-${index}`,
          recentRevealedCycleIds: ['cycle-1'],
          existingSnapshotCycleIds: [],
        }),
      );
      await Promise.resolve();
      expect(direct.mock.calls.some((call) => call[2])).toBe(false);
      release();
      await rebuild;
      expect(await Promise.all(coverage)).toEqual(Array(100).fill(true));
      expect(direct.mock.calls.filter((call) => call[2])).toHaveLength(1);
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('serializes user-cycle snapshot fills behind whole-cycle rebuilds for the same cycle', async () => {
    let releaseCycleTransaction!: () => void;
    const cycleTransactionStarted = Promise.resolve();
    const cycleTransactionCanFinish = new Promise<void>((resolve) => {
      releaseCycleTransaction = resolve;
    });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      matchCycle: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'cycle-1',
            codename: 'Cycle 1',
            revealAt: new Date('2026-04-01T00:00:00.000Z'),
            status: 'REVEALED',
          })
          .mockResolvedValueOnce({
            id: 'cycle-1',
            codename: 'Cycle 1',
            revealAt: new Date('2026-04-01T00:00:00.000Z'),
            status: 'REVEALED',
          }),
      },
      cycleParticipation: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          userId: 'user-1',
          status: 'OPTED_IN',
        }),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      block: {
        findMany: jest.fn(),
      },
      userCycleDashboardSnapshot: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    const transactionEvents: string[] = [];
    const prisma = {
      $transaction: jest.fn(
        async (callback: (store: typeof tx) => Promise<void>) => {
          transactionEvents.push('start');

          if (transactionEvents.length === 1) {
            await cycleTransactionStarted;
            await cycleTransactionCanFinish;
          }

          await callback(tx);
          transactionEvents.push('finish');
        },
      ),
    };
    const service = new DashboardSnapshotService(prisma as never);

    const cycleSync = service.syncCycleSnapshots('cycle-1');
    await cycleTransactionStarted;
    const userSync = service.syncUserCycleSnapshot({
      userId: 'user-1',
      cycleId: 'cycle-1',
    });

    await Promise.resolve();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    releaseCycleTransaction();
    await Promise.all([cycleSync, userSync]);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(transactionEvents).toEqual(['start', 'finish', 'start', 'finish']);
  });

  it('allows independent users to fill in parallel while keeping a full rebuild exclusive', async () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const first = deferred();
    const second = deferred();
    const rebuild = deferred();
    const usersStarted = deferred();
    const rebuildStarted = deferred();
    const events: string[] = [];
    const prisma = {
      $transaction: jest.fn(
        async (callback: (store: unknown) => Promise<void>) => callback({}),
      ),
    };
    const service = new DashboardSnapshotService(prisma as never);
    const methods = service as unknown as {
      syncUserCycleSnapshotDirect(input: { userId: string }): Promise<void>;
      syncCycleSnapshotsDirect(): Promise<void>;
    };
    jest
      .spyOn(methods, 'syncUserCycleSnapshotDirect')
      .mockImplementation(async ({ userId }) => {
        events.push(userId);
        if (events.includes('first') && events.includes('second'))
          usersStarted.resolve();
        if (userId === 'first') await first.promise;
        if (userId === 'second') await second.promise;
      });
    jest
      .spyOn(methods, 'syncCycleSnapshotsDirect')
      .mockImplementation(async () => {
        events.push('rebuild');
        rebuildStarted.resolve();
        await rebuild.promise;
      });
    const a = service.syncUserCycleSnapshot({
      userId: 'first',
      cycleId: 'cycle',
    });
    const b = service.syncUserCycleSnapshot({
      userId: 'second',
      cycleId: 'cycle',
    });
    await usersStarted.promise;
    const all = service.syncCycleSnapshots('cycle');
    const after = service.syncUserCycleSnapshot({
      userId: 'after',
      cycleId: 'cycle',
    });
    first.resolve();
    await a;
    expect(events).toEqual(['first', 'second']);
    second.resolve();
    await b;
    await rebuildStarted.promise;
    expect(events).toEqual(['first', 'second', 'rebuild']);
    rebuild.resolve();
    await Promise.all([all, after]);
    expect(events).toEqual(['first', 'second', 'rebuild', 'after']);
  });

  it('removes unrevealed match snapshots instead of upserting them', async () => {
    const store = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      match: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'match-1',
          cycleId: 'cycle-1',
          score: 88,
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

  it.each([null, new Date('2026-04-02T00:00:00.000Z')])(
    'discloses frozen contacts only after introduction (%s)',
    async (introducedAt) => {
      const upsert: jest.MockedFunction<
        (args: DashboardSnapshotUpsertArg) => Promise<void>
      > = jest.fn().mockResolvedValue(undefined);
      const store = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        match: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'match-1',
            cycleId: 'cycle-1',
            score: 88,
            reasons: ['reason'],
            reason: 'reason',
            conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
            introducedAt,
            revealedAt: new Date('2026-04-01T00:00:00.000Z'),
            cycle: {
              id: 'cycle-1',
              codename: 'Cycle 1',
              revealAt: new Date('2026-04-01T00:00:00.000Z'),
            },
            reports: [],
            participants: [
              {
                userId: 'user-1',
                introducedContactType: 'WECHAT',
                introducedContactValue: 'wx_user_1',
                user: {
                  email: 'user-1@example.com',
                  preferredContactChannel: 'WECHAT',
                  contactMethods: [{ type: 'WECHAT', value: 'changed_wechat' }],
                  displayName: 'User 1',
                  profile: { headline: 'hello' },
                  school: { name: 'School A' },
                  questionnaireResponse: null,
                },
              },
              {
                userId: 'user-2',
                introducedContactType: 'PHONE',
                introducedContactValue: '+14155552671',
                user: {
                  email: 'user-2@example.com',
                  preferredContactChannel: 'PHONE',
                  contactMethods: [{ type: 'PHONE', value: '+8613800000000' }],
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
          findMany: jest.fn().mockResolvedValue([
            { userId: 'user-1', status: 'OPTED_IN' },
            { userId: 'user-2', status: 'OPTED_IN' },
          ]),
        },
        block: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        userCycleDashboardSnapshot: {
          deleteMany: jest.fn(),
          upsert,
        },
      };
      const service = new DashboardSnapshotService({} as never);

      await service.syncMatchSnapshots('match-1', store as never);

      const upsertArg = upsert.mock.calls
        .map(([arg]) => arg)
        .find(
          (arg) =>
            arg.where.userId_cycleId.userId === 'user-1' &&
            arg.where.userId_cycleId.cycleId === 'cycle-1',
        );
      expect(upsertArg).toBeDefined();
      if (!upsertArg) {
        throw new Error('Expected a dashboard snapshot upsert for user-1');
      }
      expect(upsertArg.where.userId_cycleId).toEqual({
        userId: 'user-1',
        cycleId: 'cycle-1',
      });
      if (!introducedAt) {
        expect(upsertArg.create).toMatchObject({
          result: 'UNMATCHED',
          visibility: 'NOT_APPLICABLE',
          limitedReason: null,
          matchId: null,
          matchPayload: Prisma.DbNull,
        });
        expect(upsert).toHaveBeenCalledTimes(2);
        return;
      }
      expect(upsertArg.create.matchPayload.participants).toContainEqual(
        expect.objectContaining({
          userId: 'user-2',
          email: null,
          contact: introducedAt
            ? {
                type: 'PHONE',
                label: '手机号',
                value: '+14155552671',
              }
            : null,
        }),
      );
      expect(JSON.stringify(upsertArg.create.matchPayload)).not.toContain(
        '+8613800000000',
      );
    },
  );
});
