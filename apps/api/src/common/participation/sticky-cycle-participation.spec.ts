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
    $transaction: jest.fn((fn: (tx: typeof inner) => unknown) =>
      Promise.resolve(fn(inner)),
    ),
  };
}

afterEach(() => {
  clearStickyParticipationCache();
});

describe('ensureStickyCycleParticipations', () => {
  it('creates missing current-cycle records from each user\u2019s latest previous participation state', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = buildMockPrisma({
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ userId: 'user-existing' }])
        .mockResolvedValueOnce([
          {
            userId: 'user-opted-in',
            status: 'OPTED_IN',
            intent: 'FRIEND',
            updatedAt: new Date('2026-04-01T10:00:00.000Z'),
            user: {
              questionnaireResponse: {
                submittedAt: new Date('2026-03-15T00:00:00.000Z'),
              },
            },
          },
          {
            userId: 'user-opted-in-no-intent',
            status: 'OPTED_IN',
            intent: null,
            updatedAt: new Date('2026-04-01T09:30:00.000Z'),
            user: {
              questionnaireResponse: {
                submittedAt: new Date('2026-03-15T00:00:00.000Z'),
              },
            },
          },
          {
            userId: 'user-opted-out',
            status: 'OPTED_OUT',
            intent: 'DATE',
            updatedAt: new Date('2026-04-01T09:00:00.000Z'),
          },
          {
            userId: 'user-opted-in',
            status: 'OPTED_OUT',
            intent: null,
            updatedAt: new Date('2026-03-01T09:00:00.000Z'),
          },
          {
            userId: 'user-existing',
            status: 'OPTED_IN',
            intent: 'BOTH',
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
    ).resolves.toEqual({ createdCount: 3 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const createManyCalls = createMany.mock.calls as Array<
      [
        {
          data: Array<{
            cycleId: string;
            userId: string;
            status: 'OPTED_IN' | 'OPTED_OUT';
            intent: 'FRIEND' | 'DATE' | 'BOTH' | null;
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
    // Sticky carry-over preserves the latest stored intent for OPTED_IN users
    // and falls back to BOTH for pre-feature OPTED_IN rows with no intent yet.
    expect(createManyArgument.data).toEqual([
      {
        cycleId: 'cycle-2',
        userId: 'user-opted-in',
        status: 'OPTED_IN',
        intent: 'FRIEND',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-opted-in-no-intent',
        status: 'OPTED_IN',
        intent: 'BOTH',
        optedInAt: createManyArgument.data[1]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-opted-out',
        status: 'OPTED_OUT',
        intent: null,
        optedInAt: null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
    expect(createManyArgument.data[1]?.optedInAt).toBeInstanceOf(Date);
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

  it('downgrades a carried-over OPTED_IN to OPTED_OUT when the user has no submitted questionnaire', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = buildMockPrisma({
      findMany: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            userId: 'user-submitted',
            status: 'OPTED_IN',
            intent: 'FRIEND',
            updatedAt: new Date('2026-04-01T10:00:00.000Z'),
            user: {
              questionnaireResponse: {
                submittedAt: new Date('2026-03-20T00:00:00.000Z'),
              },
            },
          },
          {
            userId: 'user-no-questionnaire',
            status: 'OPTED_IN',
            intent: 'DATE',
            updatedAt: new Date('2026-04-01T09:30:00.000Z'),
            user: { questionnaireResponse: null },
          },
          {
            userId: 'user-draft-only',
            status: 'OPTED_IN',
            intent: 'BOTH',
            updatedAt: new Date('2026-04-01T09:00:00.000Z'),
            user: { questionnaireResponse: { submittedAt: null } },
          },
        ]),
      createMany,
    });

    await ensureStickyCycleParticipations(prisma as never, {
      id: 'cycle-2',
      revealAt: new Date('2026-05-01T12:00:00.000Z'),
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      status: 'OPEN',
    });

    const createManyArgument = (
      createMany.mock.calls as Array<
        [
          {
            data: Array<{
              cycleId: string;
              userId: string;
              status: 'OPTED_IN' | 'OPTED_OUT';
              intent: 'FRIEND' | 'DATE' | 'BOTH' | null;
              optedInAt: Date | null;
            }>;
          },
        ]
      >
    )[0]?.[0];

    if (!createManyArgument) {
      throw new Error('Expected createMany to be called.');
    }

    // The user with a submitted questionnaire keeps OPTED_IN; the one with no
    // questionnaire and the one stuck on a draft are downgraded to OPTED_OUT so
    // the carry-over never re-introduces unmatchable "participants".
    expect(createManyArgument.data).toEqual([
      {
        cycleId: 'cycle-2',
        userId: 'user-submitted',
        status: 'OPTED_IN',
        intent: 'FRIEND',
        optedInAt: createManyArgument.data[0]?.optedInAt ?? null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-no-questionnaire',
        status: 'OPTED_OUT',
        intent: null,
        optedInAt: null,
      },
      {
        cycleId: 'cycle-2',
        userId: 'user-draft-only',
        status: 'OPTED_OUT',
        intent: null,
        optedInAt: null,
      },
    ]);
    expect(createManyArgument.data[0]?.optedInAt).toBeInstanceOf(Date);
  });
});
