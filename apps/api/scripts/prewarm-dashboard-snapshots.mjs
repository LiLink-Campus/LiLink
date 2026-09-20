import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export function verifyPrewarmTarget(options, settings, bundledRelease) {
  assert.match(options['expected-release'] ?? '', /^[a-f0-9]{40}$/, 'An exact expected release is required.');
  assert.equal(bundledRelease.trim(), options['expected-release'], 'The image release does not match.');
  assert.ok(options['expected-host'] && options['expected-database'], 'Explicit database host and name are required.');
  const database = new URL(settings.DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(database.protocol), 'PostgreSQL is required.');
  assert.equal(database.hostname, options['expected-host'], 'The database host does not match.');
  assert.equal(decodeURIComponent(database.pathname.slice(1)), options['expected-database'], 'The database name does not match.');
  if (options.apply) {
    assert.equal(settings.RELEASE_MAINTENANCE, 'true', 'Maintenance must be enabled before rebuilding snapshots.');
    assert.equal(settings.BACKGROUND_JOBS_ENABLED, 'false', 'Background jobs must be paused.');
    assert.equal(settings.MAIL_DELIVERY_ENABLED, 'false', 'Mail delivery must be paused.');
  }
  return { host: database.hostname, database: options['expected-database'], release: bundledRelease.trim(), apply: Boolean(options.apply) };
}

async function main() {
  const { values } = parseArgs({ options: {
    'expected-release': { type: 'string' },
    'expected-host': { type: 'string' },
    'expected-database': { type: 'string' },
    apply: { type: 'boolean', default: false },
  } });
  const identity = verifyPrewarmTarget(values, process.env, await readFile(new URL('../dist/.sentry-release', import.meta.url), 'utf8'));
  const require = createRequire(import.meta.url);
  const { PrismaService } = require('../dist/src/common/prisma/prisma.service.js');
  const { DashboardSnapshotService } = require('../dist/src/common/dashboard/dashboard-snapshot.service.js');
  const db = new PrismaService();
  try {
    await db.$connect();
    const [database] = await db.$queryRaw`SELECT current_database() AS name`;
    assert.equal(database.name, identity.database);
    const migrations = await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.ok(migrations.some(row => row.migration_name === '20260920200000_archive_and_reset_questionnaires'), 'Questionnaire reset migration is missing.');
    const coverage = () => db.$queryRaw`
      SELECT c.id, count(p."userId")::int AS expected,
        count(s."userId")::int AS present,
        (SELECT count(*)::int FROM "UserCycleDashboardSnapshot" retained
          WHERE retained."cycleId" = c.id AND NOT EXISTS (
            SELECT 1 FROM "CycleParticipation" cp
            WHERE cp."cycleId" = c.id AND cp."userId" = retained."userId"
          )) AS retained_without_participation
      FROM "MatchCycle" c
      LEFT JOIN "CycleParticipation" p ON p."cycleId" = c.id
      LEFT JOIN "UserCycleDashboardSnapshot" s ON s."cycleId" = c.id AND s."userId" = p."userId"
      WHERE c.status = 'REVEALED'
      GROUP BY c.id ORDER BY c.id
    `;
    const invariant = () => db.$queryRaw`
      SELECT
        (SELECT md5(coalesce(string_agg(to_jsonb(m)::text, '' ORDER BY m.id), '')) FROM "Match" m) AS matches,
        (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '' ORDER BY p.id), '')) FROM "MatchParticipant" p) AS participants,
        (SELECT md5(coalesce(string_agg(to_jsonb(e)::text, '' ORDER BY e.id), '')) FROM "OutboundEmail" e) AS mail
    `;
    const before = await coverage();
    const report = { ...identity, startedAt: new Date().toISOString(), before, cycles: [] };
    if (identity.apply) {
      const original = await invariant();
      const service = new DashboardSnapshotService(db);
      for (const cycle of before) {
        if (cycle.expected === cycle.present) continue;
        const started = performance.now();
        if (cycle.retained_without_participation > 0) {
          // Preserve retained history rows that have no participation record.
          const missing = await db.$queryRaw`
            SELECT p."userId" FROM "CycleParticipation" p
            WHERE p."cycleId" = ${cycle.id} AND NOT EXISTS (
              SELECT 1 FROM "UserCycleDashboardSnapshot" s
              WHERE s."cycleId" = p."cycleId" AND s."userId" = p."userId"
            ) ORDER BY p."userId"
          `;
          for (const row of missing) await service.syncUserCycleSnapshot({ userId: row.userId, cycleId: cycle.id });
        } else {
          await service.syncCycleSnapshots(cycle.id);
        }
        report.cycles.push({ id: cycle.id, ms: Math.round(performance.now() - started) });
      }
      const after = await coverage();
      assert.ok(after.every(row => row.expected === row.present), 'Snapshot coverage is incomplete.');
      assert.deepEqual(after.map(row => [row.id, row.expected, row.retained_without_participation]), before.map(row => [row.id, row.expected, row.retained_without_participation]), 'Revealed cycles or retained history changed during maintenance.');
      assert.deepEqual(await invariant(), original, 'Matching, contact grants or mail changed during prewarming.');
      report.after = after;
      report.matchingAndMailUnchanged = true;
    }
    report.finishedAt = new Date().toISOString();
    console.log(JSON.stringify(report));
  } finally { await db.$disconnect(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof assert.AssertionError ? error.message : `Snapshot prewarm failed (${error.code ?? error.name}).`);
    process.exitCode = 1;
  });
}
