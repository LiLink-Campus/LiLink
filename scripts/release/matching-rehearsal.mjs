import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const target = new URL(process.env.DATABASE_URL);
if (target.hostname !== 'ep-crimson-thunder-aztzdzla.c-3.ap-southeast-1.aws.neon.tech' || target.pathname !== '/neondb' || target.username !== 'release_load') throw new Error('Refusing matching rehearsal outside the dedicated synthetic project.');
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { createPrismaClient } = require('./dist/src/common/prisma/client.js');
const db = createPrismaClient();
const base = 'http://release-api:4000/v1';
async function tick() {
  const response = await fetch(`${base}/internal/cycles/tick`, { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET }, signal: AbortSignal.timeout(240_000) });
  assert.equal(response.status, 201);
  return response.json();
}
try {
  assert.equal(await db.user.count(), 2000);
  assert.equal(await db.user.count({ where: { id: { startsWith: 'release_user_' }, email: { endsWith: '@release.example.test' } } }), 2000);
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await fetch(`${base}/health`)).status, 200); break; }
    catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  // Keep the write-load fixture open while the dedicated matching cycles run.
  await db.matchCycle.update({ where: { id: 'release_current' }, data: { participationDeadline: new Date(Date.now() + 4 * 3600_000), revealAt: new Date(Date.now() + 5 * 3600_000) } });
  for (const count of [500, 1000, 2000]) {
    const cycleId = `release_worker_${process.env.SENTRY_RELEASE}_${count}`;
    assert.equal(await db.matchCycle.count({ where: { id: cycleId } }), 0, 'Use a fresh candidate SHA for a new rehearsal.');
    await db.matchCycle.create({ data: { id: cycleId, codename: `合成撮合 ${count} ${process.env.SENTRY_RELEASE.slice(0, 12)}`, status: 'OPEN', participationDeadline: new Date(Date.now() - 60_000), revealAt: new Date(Date.now() + 3600_000) } });
    await db.cycleParticipation.createMany({ data: Array.from({ length: count }, (_, i) => ({ cycleId, userId: `release_user_${String(i).padStart(4, '0')}`, status: 'OPTED_IN', intent: 'BOTH', optedInAt: new Date() })) });
    let pending = true;
    const latencies = [];
    const health = (async () => {
      while (pending) {
        const start = performance.now();
        const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
        assert.equal(response.status, 200);
        latencies.push(performance.now() - start);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    })();
    // Attach a rejection handler before awaiting the matching request.
    const healthResult = health.then(() => null, error => error);
    const start = performance.now();
    let prepared;
    try { prepared = await tick(); } finally { pending = false; }
    const healthError = await healthResult;
    if (healthError) throw healthError;
    assert.ok(prepared.preparedCycleIds.includes(cycleId), 'HTTP success did not prepare the expected cycle.');
    const prepareMs = Math.round(performance.now() - start);
    const matches = await db.match.findMany({ where: { cycleId }, include: { participants: { select: { userId: true, profileSnapshot: true } } } });
    assert.equal(matches.length, count / 2);
    assert.ok(matches.every(m => m.participants.length === 2));
    const participants = matches.flatMap(m => m.participants);
    assert.equal(new Set(participants.map(p => p.userId)).size, count);
    assert.ok(participants.every(p => p.profileSnapshot?.source === 'matching-preparation'));
    console.log(JSON.stringify({ stage: 'prepared', participants: count, matches: matches.length, prepareMs, healthRequests: latencies.length, healthMaxMs: Math.round(Math.max(...latencies)) }));
    await db.matchCycle.update({ where: { id: cycleId }, data: { revealAt: new Date(Date.now() - 1000) } });
    const revealStart = performance.now();
    const revealed = await tick();
    assert.ok(revealed.revealedCycleIds.includes(cycleId), 'HTTP success did not reveal the expected cycle.');
    assert.equal(await db.userCycleDashboardSnapshot.count({ where: { cycleId } }), count, 'Reveal did not finish all dashboard snapshots.');
    assert.equal(await db.match.count({ where: { cycleId, introducedAt: { not: null } } }), count / 2);
    console.log(JSON.stringify({ stage: 'revealed', participants: count, matches: count / 2, snapshots: count, revealMs: Math.round(performance.now() - revealStart) }));
  }
} finally { await db.$disconnect(); }
