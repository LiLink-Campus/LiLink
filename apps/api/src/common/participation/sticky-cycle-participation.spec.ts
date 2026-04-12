import { ensureStickyCycleParticipations } from './sticky-cycle-participation';

describe('ensureStickyCycleParticipations', () => {
  it('creates missing current-cycle records from each user’s latest previous participation state', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      cycleParticipation: {
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
      },
      matchCycle: {
        findUnique: jest.fn(),
      },
    };

    await expect(
      ensureStickyCycleParticipations(prisma as never, {
        id: 'cycle-2',
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
        status: 'OPEN',
      }),
    ).resolves.toEqual({ createdCount: 2 });

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
    const prisma = {
      cycleParticipation: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      matchCycle: {
        findUnique: jest.fn(),
      },
    };

    await expect(
      ensureStickyCycleParticipations(prisma as never, {
        id: 'cycle-2',
        revealAt: new Date('2026-05-01T12:00:00.000Z'),
        createdAt: new Date('2026-04-20T12:00:00.000Z'),
        status: 'DRAFT',
      }),
    ).resolves.toEqual({ createdCount: 0 });

    expect(prisma.cycleParticipation.findMany).not.toHaveBeenCalled();
    expect(prisma.cycleParticipation.createMany).not.toHaveBeenCalled();
  });
});
