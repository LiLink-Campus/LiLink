import {
  ensureStickyCycleParticipations,
  clearStickyParticipationCache,
} from './sticky-cycle-participation';

function buildMockPrisma(overrides: {
  findMany: jest.Mock;
  createMany: jest.Mock;
}) {
  const inner = {
    cycleParticipation: {
      findMany: overrides.findMany,
      createMany: overrides.createMany,
    },
    matchCycle: {
      findUnique: jest.fn(),
    },
  };
  return {
    ...inner,
    $transaction: jest.fn(async (fn: (tx: typeof inner) => unknown) =>
      fn(inner),
    ),
  };
}

afterEach(() => {
  clearStickyParticipationCache();
});

describe('ensureStickyCycleParticipations', () => {
  it('creates missing current-cycle records from each user\u2019s latest previous participation state', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = buildMockPrisma({
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ userId: 'user-existing' }])
        .mockResolvedValueOnce([
          {
            userId: 'user-opted-in',
            status: 'OPTED_IN',
            updatedAt: new Date('2026-04-01T10:00:00.000Z'),
          },
          {
            userId: 'user-opted-out',
            status: 'OPTED_OUT',
            updatedAt: new Date('2026-04-01T09:00:00.000Z'),
          },
          {
            userId: 'user-opted-in',
            status: 'OPTED_OUT',
            updatedAt: new Date('2026-03-01T09:00:00.000Z'),
          },
          {
            userId: 'user-existing',
            status: 'OPTED_IN',
            updatedAt: new Date('2026-04-01T08:00:00.000Z'),
          },
        ]),
      createMany,
    });

    await expect(
      ensureStickyCycleParticipations(prisma as never, {
        id: 'cycle-2',
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
        status: 'OPEN',
      }),
    ).resolves.toEqual({ createdCount: 2 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

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
        userId: 'user-opted-in',
        status: 'OPTED_IN',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-opted-out',
        status: 'OPTED_OUT',
        optedInAt: null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
  });

  it('does nothing for cycles that are not open for participation', async () => {
    const findMany = jest.fn();
    const createMany = jest.fn();
    const prisma = buildMockPrisma({ findMany, createMany });

    await expect(
      ensureStickyCycleParticipations(prisma as never, {
        id: 'cycle-2',
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
        status: 'DRAFT',
      }),
    ).resolves.toEqual({ createdCount: 0 });

    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips database queries when the same cycle was processed recently', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const createMany = jest.fn();
    const prisma = buildMockPrisma({ findMany, createMany });

    const cycle = {
      id: 'cycle-cached',
      revealAt: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      status: 'OPEN' as const,
    };

    await ensureStickyCycleParticipations(prisma as never, cycle);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    findMany.mockClear();
    prisma.$transaction.mockClear();

    await expect(
      ensureStickyCycleParticipations(prisma as never, cycle),
    ).resolves.toEqual({ createdCount: 0 });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('re-queries after the cache is cleared', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const createMany = jest.fn();
    const prisma = buildMockPrisma({ findMany, createMany });

    const cycle = {
      id: 'cycle-clear',
      revealAt: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      status: 'OPEN' as const,
    };

    await ensureStickyCycleParticipations(prisma as never, cycle);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    clearStickyParticipationCache();
    prisma.$transaction.mockClear();

    await ensureStickyCycleParticipations(prisma as never, cycle);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
