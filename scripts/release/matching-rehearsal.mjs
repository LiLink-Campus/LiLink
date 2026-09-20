import { resolveDatabaseTarget } from './targets.mjs';
import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

resolveDatabaseTarget(process.env.DATABASE_URL);
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { createPrismaClient } = require('./dist/src/common/prisma/client.js');
const db = createPrismaClient();
const base = 'http://release-api:4000/v1';
assert.match(process.env.SENTRY_RELEASE ?? '', /^[a-f0-9]{40}$/, 'An exact candidate SHA is required.');
assert.ok(['true', 'false'].includes(process.env.BACKGROUND_JOBS_ENABLED));
const automaticJobs = process.env.BACKGROUND_JOBS_ENABLED === 'true';
const timingFailures = [];
async function waitForCompletion(check, message, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
async function receivedMessages() {
  const messages = [];
  for (let start = 0; ; ) {
    const response = await fetch(`http://release-mail:8025/api/v1/messages?start=${start}&limit=500`, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const page = await response.json();
    messages.push(...page.messages);
    start += page.messages.length;
    if (start >= page.total) return messages;
    assert.ok(page.messages.length > 0, 'Mailpit pagination stopped before the final receipt.');
  }
}
async function tick() {
  const response = await fetch(`${base}/internal/cycles/tick`, { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET }, signal: AbortSignal.timeout(240_000) });
  assert.equal(response.status, 201);
  return response.json();
}
try {
  assert.equal(await db.user.count(), 2000);
  assert.equal(await db.user.count({ where: { id: { startsWith: 'release_user_' }, email: { endsWith: '@release.example.test' } } }), 2000);
  // Retain prior pairs while stopping abandoned cycles from being scheduled.
  await db.matchCycle.updateMany({ where: { id: { startsWith: 'release_worker_' }, status: { not: 'REVEALED' } }, data: { status: 'DRAFT' } });
  await db.outboundEmail.updateMany({ where: { recipientEmail: { endsWith: '@release.example.test' }, dedupeKey: { startsWith: 'match-reveal:' }, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } }, data: { status: 'EXHAUSTED', errorMessage: 'Previous synthetic rehearsal retained; delivery retired.' } });
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await fetch(`${base}/health`)).status, 200); break; }
    catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  // Keep the write-load fixture open while the dedicated matching cycles run.
  await db.matchCycle.update({ where: { id: 'release_current' }, data: { participationDeadline: new Date(Date.now() + 4 * 3600_000), revealAt: new Date(Date.now() + 5 * 3600_000) } });
  for (const count of [500, 1000, 2000]) {
    const stopped = await access('/release-output/stop-matching').then(() => true, () => false);
    assert.equal(stopped, false, 'Normal read load stopped; do not advance to the next matching stage.');
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
    try {
      prepared = await tick();
      if (!prepared.preparedCycleIds.includes(cycleId) && automaticJobs) {
        await waitForCompletion(async () => (await db.matchCycle.findUnique({ where: { id: cycleId } }))?.status === 'REVEAL_READY', 'The scheduler did not finish the expected preparation.');
      } else {
        assert.ok(prepared.preparedCycleIds.includes(cycleId), 'HTTP success did not prepare the expected cycle.');
      }
    } finally { pending = false; }
    const healthError = await healthResult;
    if (healthError) throw healthError;
    const prepareMs = Math.round(performance.now() - start);
    if (prepareMs > 60_000) timingFailures.push(`${count} participants prepared in ${prepareMs} ms (limit 60000).`);
    const matches = await db.match.findMany({ where: { cycleId }, include: { participants: { select: { userId: true, profileSnapshot: true } } } });
    assert.equal(matches.length, count / 2);
    assert.ok(matches.every(m => m.participants.length === 2));
    const participants = matches.flatMap(m => m.participants);
    assert.equal(new Set(participants.map(p => p.userId)).size, count);
    assert.ok(participants.every(p => p.profileSnapshot?.source === 'matching-preparation'));
    console.log(JSON.stringify({ stage: 'prepared', participants: count, matches: matches.length, prepareMs, automaticJobs, completedByManualTick: prepared.preparedCycleIds.includes(cycleId), healthRequests: latencies.length, healthMaxMs: Math.round(Math.max(...latencies)) }));
    const previousReceipts = new Set((await receivedMessages()).map(message => message.ID));
    await db.matchCycle.update({ where: { id: cycleId }, data: { revealAt: new Date(Date.now() - 1000) } });
    const revealStart = performance.now();
    const revealed = await tick();
    if (!revealed.revealedCycleIds.includes(cycleId) && automaticJobs) {
      await waitForCompletion(async () => (await db.matchCycle.findUnique({ where: { id: cycleId } }))?.status === 'REVEALED' && await db.userCycleDashboardSnapshot.count({ where: { cycleId } }) === count, 'The scheduler did not finish the expected reveal.');
    } else {
      assert.ok(revealed.revealedCycleIds.includes(cycleId), 'HTTP success did not reveal the expected cycle.');
    }
    assert.equal(await db.userCycleDashboardSnapshot.count({ where: { cycleId } }), count, 'Reveal did not finish all dashboard snapshots.');
    assert.equal(await db.match.count({ where: { cycleId, introducedAt: { not: null } } }), count / 2);
    console.log(JSON.stringify({ stage: 'revealed', participants: count, matches: count / 2, snapshots: count, revealMs: Math.round(performance.now() - revealStart) }));
    const dedupeKeys = matches.flatMap(match => [0, 1].map(index => `match-reveal:${match.id}:${index}`));
    assert.equal(await db.outboundEmail.count({ where: { dedupeKey: { in: dedupeKeys } } }), count);
    while (await db.outboundEmail.count({ where: { dedupeKey: { in: dedupeKeys }, status: 'SENT' } }) !== count) {
      assert.ok(performance.now() - revealStart < 600_000, 'Match email queue did not drain within ten minutes.');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const replay = await tick();
    assert.ok(!replay.revealedCycleIds.includes(cycleId), 'Repeated scheduling revealed a completed cycle.');
    const receipts = (await receivedMessages()).filter(message => !previousReceipts.has(message.ID));
    assert.equal(receipts.length, count, 'The mailbox did not receive exactly one email per participant.');
    assert.ok(receipts.every(message => message.To.length === 1));
    assert.deepEqual(receipts.map(message => message.To[0].Address).sort(), Array.from({ length: count }, (_, i) => `user${i}@release.example.test`).sort());
    console.log(JSON.stringify({ stage: 'mail-delivered', participants: count, sent: count, received: receipts.length, revealToQueueDrainedMs: Math.round(performance.now() - revealStart), repeatedReveal: false }));
  }
  assert.deepEqual(timingFailures, [], 'Matching preparation exceeded the release time budget.');
} finally { await db.$disconnect(); }
