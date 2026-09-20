import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { loadPrismaClientModule } from './prisma-client.mjs';

// Only explicitly selected test accounts in the local development database.
const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const userId = process.argv.find((arg) => arg.startsWith('--user-id='))?.slice(10);
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink' || !userId || !process.argv.includes('--apply')) {
  throw new Error('Requires local development lilink database, --user-id=<test-user-id> and --apply.');
}
const { createPrismaClient } = await loadPrismaClientModule([
  'dist/src/common/dashboard/dashboard-snapshot.service.js',
]);
const { DashboardSnapshotService } = await import('../dist/src/common/dashboard/dashboard-snapshot.service.js');
const prisma = createPrismaClient();
const prefix = `layout-history-v1-${userId}`;
try {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.isTest) throw new Error('Target must be a test account.');
  const snapshots = new DashboardSnapshotService(prisma);
  const passwordHash = await argon2.hash(randomBytes(48).toString('hex'));
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.matchCycle.findMany({ where: { id: { startsWith: prefix } } });
    if (existing.length) throw new Error('Fixture already exists; no existing records will be overwritten.');
    const latest = await tx.matchCycle.findFirst({ where: { status: 'REVEALED' }, orderBy: { revealAt: 'desc' } });
    const now = Date.now();
    const start = latest?.revealAt.getTime() ?? now - 4 * 86400000;
    if (start >= now - 60000) throw new Error('No past interval available for three newer revealed fixtures.');
    const partner = await tx.user.create({ data: {
      id: `${prefix}-partner`, email: `${prefix}@example.invalid`, passwordHash,
      displayName: '林同学（测试）', status: 'ACTIVE', isTest: true, schoolId: user.schoolId,
      profile: { create: { headline: '喜欢散步、看展和独立电影，期待分享校园日常。' } },
    } });
    const ids = [];
    for (let index = 0; index < 3; index++) {
      const id = `${prefix}-${index}`;
      const revealAt = new Date(start + (now - start) * (index + 1) / 4);
      await tx.matchCycle.create({ data: {
        id, codename: ['测试·秋日来信', '测试·校园相遇', '测试·九月新篇'][index],
        status: 'REVEALED', revealAt,
        participationDeadline: new Date(revealAt.getTime() - 3600000),
        notes: `Local match layout fixture for test account ${userId}`,
      } });
      await tx.cycleParticipation.create({ data: {
        userId, cycleId: id, status: index === 2 ? 'OPTED_OUT' : 'OPTED_IN',
        intent: index === 2 ? null : 'BOTH',
        optedInAt: index === 2 ? null : new Date(revealAt.getTime() - 7200000),
      } });
      if (index === 0) {
        await tx.cycleParticipation.create({ data: { userId: partner.id, cycleId: id, status: 'OPTED_IN', intent: 'BOTH', optedInAt: new Date(revealAt.getTime() - 7200000) } });
        await tx.match.create({ data: {
          id: `${prefix}-match`, cycleId: id, score: 92, revealedAt: revealAt, introducedAt: revealAt,
          participants: { create: [
            { userId, cycleId: id, position: 0 },
            { userId: partner.id, cycleId: id, position: 1, introducedContactType: 'WECHAT', introducedContactValue: 'lilink_demo_only' },
          ] },
        } });
        await snapshots.syncUserCycleSnapshot({ userId: partner.id, cycleId: id }, tx);
      }
      await snapshots.syncUserCycleSnapshot({ userId, cycleId: id }, tx);
      ids.push(id);
    }
    return tx.userCycleDashboardSnapshot.findMany({ where: { userId, cycleId: { in: ids } }, select: { cycleCodename: true, result: true, participationStatus: true }, orderBy: { cycleRevealAt: 'desc' } });
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
