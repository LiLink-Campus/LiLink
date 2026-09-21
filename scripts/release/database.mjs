import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [action, targetFile] = process.argv.slice(2);
if (!['audit', 'backup', 'migrate', 'restore'].includes(action) || !targetFile) {
  throw new Error('Usage: node scripts/release/database.mjs audit|backup|migrate|restore <isolated-target.json>');
}
const manifestPath = path.resolve(targetFile);
const dir = path.dirname(manifestPath);
const target = JSON.parse(await readFile(manifestPath, 'utf8'));
const raw = (await readFile(path.resolve(dir, target.connectionFile), 'utf8')).trim();
const url = new URL(raw);
if (target.purpose !== 'isolated-release-rehearsal' || !target.branchId?.startsWith('br-') ||
    target.branchId === 'br-restless-credit-aozwmv5h' ||
    url.hostname !== target.directHost || url.hostname.includes('ep-lucky-wave-aoy717xy') ||
    !url.hostname.endsWith('.aws.neon.tech') || url.hostname.includes('-pooler.') ||
    !url.hostname.startsWith(`${target.computeId}.`) || target.computeBranchId !== target.branchId ||
    url.pathname !== '/neondb' || url.protocol !== 'postgresql:') {
  throw new Error('Refusing an unverified or production database target. Resolve branch and compute metadata first.');
}
console.log(JSON.stringify({ action, branchId: target.branchId, host: url.hostname, database: 'neondb' }));
const client = new pg.Client({ connectionString: raw });
async function execute(executable, args, options = {}) {
  const child = spawn(executable, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let output = '';
  child.stdout?.on('data', bytes => { output += bytes; });
  child.stderr?.on('data', bytes => { output += bytes; });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${executable} failed (${code}): ${output.replaceAll(raw, '[database]').replaceAll(decodeURIComponent(url.password), '[redacted]')}`))); });
  return output;
}
async function audit() {
  await client.connect();
  try {
    const tables = {
      users: `SELECT to_jsonb(u) - ARRAY['deactivatedAt','deactivatedEmail','contactPreferencesRevision'] AS record FROM "User" u`,
      profiles: `SELECT * FROM "UserProfile"`,
      contacts: `SELECT * FROM "UserContactMethod"`,
      coupons: `SELECT * FROM "Coupon"`,
      redemptions: `SELECT * FROM "Redemption"`,
      reports: `SELECT * FROM "Report"`,
      responses: `SELECT * FROM "QuestionnaireResponse"`,
      matches: `SELECT id, "cycleId", score, "revealedAt" FROM "Match"`,
      participants: `SELECT id, "userId", "matchId", "cycleId", position FROM "MatchParticipant"`,
      currentQuestions: `SELECT q.key,q.prompt,q.description,q.type,q.weight,q."order",q.required,q."selectionLimit",q.options FROM "Question" q JOIN "QuestionnaireVersion" v ON v.id=q."versionId" WHERE v."isCurrent"`,
    };
    const result = {};
    for (const [name, sql] of Object.entries(tables)) {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM (${sql}) t`);
      result[name] = rows[0];
    }
    result.migrations = (await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)).rows.map(row => row.migration_name);
    const archiveExists = (await client.query(`SELECT to_regclass('public."QuestionnaireResponseArchive"') IS NOT NULL AS present`)).rows[0].present;
    if (archiveExists) {
      result.archive = (await client.query(`SELECT COUNT(*)::int AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM (SELECT "sourceResponseId" AS id,"userId","versionId",answers,"draftAnswers","acknowledgedQuestionnaireVersionId","acknowledgedQuestionnaireKeys","acknowledgedHardMatchSignatures","submittedAt","sourceUpdatedAt" AS "updatedAt" FROM "QuestionnaireResponseArchive" WHERE "releaseId"='autumn-reset-2026-09-20') t`)).rows[0];
      result.reset = (await client.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE answers='{}'::jsonb AND "draftAnswers" IS NULL AND "submittedAt" IS NULL AND "acknowledgedQuestionnaireVersionId" IS NULL AND "acknowledgedQuestionnaireKeys" IS NULL AND "acknowledgedHardMatchSignatures" IS NULL)::int AS blank FROM "QuestionnaireResponse"`)).rows[0];
      result.snapshots = (await client.query(`SELECT COUNT(*)::int AS total,COUNT("profileSnapshot")::int AS frozen FROM "MatchParticipant"`)).rows[0];
    }
    await writeFile(path.join(dir, `audit-${Date.now()}.json`), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.end(); }
}
async function migrate() {
  const config = path.join(dir, 'prisma.release.config.mjs');
  await writeFile(config, `import { defineConfig } from 'prisma/config';\nexport default defineConfig({ schema: ${JSON.stringify(path.join(root, 'apps/api/prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(path.join(root, 'apps/api/prisma/migrations'))} }, datasource: {url: process.env.DATABASE_URL} });\n`);
  try {
    const output = await execute(path.join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy', '--config', config], { env: { ...process.env, DATABASE_URL: raw } });
    console.log(output);
  } finally { await rm(config, { force: true }); }
}
async function backupOrRestore() {
  const backupDir = path.join(dir, 'backup');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const conf = path.join(backupDir, 'pg_service.conf');
  const passfile = path.join(backupDir, 'encryption-key');
  const encrypted = path.join(backupDir, 'pre-upgrade.dump.enc');
  if (action === 'backup') {
    try { await writeFile(passfile, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch { throw new Error('Backup already exists. Use a new isolated target directory; never overwrite the rollback copy.'); }
  } else {
    if (target.restoreApproved !== true) throw new Error('The isolated target must explicitly opt in to restore.');
    const expected = (await readFile(path.join(backupDir, 'sha256'), 'utf8')).trim();
    if (createHash('sha256').update(await readFile(encrypted)).digest('hex') !== expected) throw new Error('Encrypted backup checksum mismatch.');
  }
  const escape = s => { if (/[\r\n]/.test(s)) throw new Error('Invalid service value'); return s; };
  await writeFile(conf, `[release]\nhost=${url.hostname}\nport=5432\ndbname=neondb\nuser=${escape(decodeURIComponent(url.username))}\npassword=${escape(decodeURIComponent(url.password))}\nsslmode=require\n`, { mode: 0o600 });
  try {
    const dockerArgs = ['run', '--rm', '-i', '-v', `${backupDir}:/backup:ro`, '-e', 'PGSERVICEFILE=/backup/pg_service.conf', '-e', 'PGSERVICE=release', 'postgres:17-alpine'];
    const opensslArgs = ['enc', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-pass', `file:${passfile}`];
    if (action === 'backup') {
      const dump = spawn('docker', [...dockerArgs, 'pg_dump', '--format=custom', '--no-owner', '--no-privileges'], { stdio: ['ignore', 'pipe', 'pipe'] });
      const encrypt = spawn('openssl', [...opensslArgs, '-out', encrypted], { stdio: ['pipe', 'ignore', 'pipe'] });
      dump.stdout.pipe(encrypt.stdin);
      await Promise.all([finished(dump), finished(encrypt)]);
      await writeFile(path.join(backupDir, 'sha256'), createHash('sha256').update(await readFile(encrypted)).digest('hex'), { mode: 0o600 });
    } else {
      // Only this already-verified disposable branch may be cleared for a full restore.
      await client.connect();
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      await client.end();
      const decrypt = spawn('openssl', [...opensslArgs, '-d', '-in', encrypted], { stdio: ['ignore', 'pipe', 'pipe'] });
      const restore = spawn('docker', [...dockerArgs, 'pg_restore', '--dbname=service=release', '--no-owner', '--no-privileges', '--exit-on-error'], { stdio: ['pipe', 'ignore', 'pipe'] });
      decrypt.stdout.pipe(restore.stdin);
      await Promise.all([finished(decrypt), finished(restore)]);
    }
    console.log(`${action} completed with encrypted backup and verified isolated target.`);
  } finally { await rm(conf, { force: true }); }
}
async function finished(child) {
  let error = '';
  child.stderr.on('data', chunk => { error += chunk; });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Backup process failed (${code}): ${error.replaceAll(raw, '[database]').replaceAll(decodeURIComponent(url.password), '[redacted]')}`))); });
}
if (action === 'audit') await audit();
else if (action === 'migrate') await migrate();
else await backupOrRestore();
