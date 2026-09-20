import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { readDashboardCycles } from '../src/modules/account/dashboard-cycles';

it('preserves recent history, older participation and per-user current intent in PostgreSQL', async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (
    target.hostname !== '127.0.0.1' ||
    target.port === '5432' ||
    !target.pathname.startsWith('/lilink_vip_test_')
  )
    throw new Error('Requires disposable local PostgreSQL.');
  const db = createPrismaClient();
  const tag = `dashboard-cycles-${randomUUID()}`;
  const users = [`${tag}-a`, `${tag}-b`];
  const history = Array.from({ length: 5 }, (_, n) => ({
    id: `${tag}-${n}`,
    codename: `${tag}-${n}`,
    status: 'REVEALED' as const,
    revealAt: new Date(Date.UTC(2600, 0, n + 1)),
    participationDeadline: new Date(Date.UTC(2600, 0, n)),
  }));
  const currentId = `${tag}-current`;
  try {
    await db.user.createMany({
      data: users.map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: 'unused',
        status: 'ACTIVE',
      })),
    });
    await db.matchCycle.createMany({
      data: [
        ...history,
        {
          id: currentId,
          codename: currentId,
          status: 'OPEN',
          revealAt: new Date(0),
          participationDeadline: new Date(0),
        },
      ],
    });
    await db.cycleParticipation.createMany({
      data: [
        {
          userId: users[0],
          cycleId: history[0].id,
          status: 'OPTED_IN',
          intent: 'DATE',
        },
        {
          userId: users[0],
          cycleId: currentId,
          status: 'OPTED_IN',
          intent: 'BOTH',
        },
        {
          userId: users[1],
          cycleId: currentId,
          status: 'OPTED_OUT',
          intent: 'FRIEND',
        },
      ],
    });
    const read = (userId: string) =>
      readDashboardCycles(db as PrismaService, userId, 3);
    const a = await read(users[0]);
    expect(
      a.filter((row) => row.kind === 'RECENT').map((row) => row.id),
    ).toEqual(
      history
        .slice(2)
        .reverse()
        .map((row) => row.id),
    );
    expect(a.find((row) => row.kind === 'CURRENT')).toMatchObject({
      id: currentId,
      participationStatus: 'OPTED_IN',
      intent: 'BOTH',
      revealAt: new Date(0),
    });
    expect(a.find((row) => row.kind === 'LAST_PARTICIPATION')).toMatchObject({
      id: history[0].id,
      participationStatus: 'OPTED_IN',
      revealAt: history[0].revealAt,
    });
    const b = await read(users[1]);
    expect(b.find((row) => row.kind === 'CURRENT')).toMatchObject({
      participationStatus: 'OPTED_OUT',
      intent: 'FRIEND',
    });
    expect(b.some((row) => row.kind === 'LAST_PARTICIPATION')).toBe(false);
    const absent = await read(`${tag}-not-a-user`);
    expect(absent.find((row) => row.kind === 'CURRENT')).toMatchObject({
      participationStatus: null,
      intent: null,
    });
    expect(absent.some((row) => row.kind === 'LAST_PARTICIPATION')).toBe(false);
    await db.matchCycle.update({
      where: { id: currentId },
      data: { status: 'REVEALED', revealAt: new Date('2700-01-01T00:00:00Z') },
    });
    const updated = await read(users[0]);
    expect(
      updated.some((row) => row.kind === 'CURRENT' && row.id === currentId),
    ).toBe(false);
    expect(updated.filter((row) => row.kind === 'RECENT')[0].id).toBe(
      currentId,
    );
    expect(updated.find((row) => row.kind === 'LAST_PARTICIPATION')?.id).toBe(
      currentId,
    );
  } finally {
    await db.cycleParticipation.deleteMany({
      where: { userId: { in: users } },
    });
    await db.matchCycle.deleteMany({ where: { id: { startsWith: tag } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
  }
});
