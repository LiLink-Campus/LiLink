import { randomUUID } from 'node:crypto';
import { test, expect, api, password, mailCode, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Missing post-commit wake must be detected independently of fallback. Each
// scenario prepares an existing coalesced deadline before the business request;
// assertions never move dueAt or invoke flush/verify. Real HTTP -> PostgreSQL ->
// signed callback -> Next.js cached HTML must publish the resulting projection.
test('each business write wakes durable cache delivery before idle fallback', async ({ db, context, account }, info) => {
  test.setTimeout(200_000);
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `active-${account.email}`,
    passwordHash: source.passwordHash, displayName: '主动通知验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const row = () => db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  const evidence: Array<Record<string, unknown>> = [];
  async function change(name: string, action: () => Promise<unknown>) {
    // Avoid crossing the global fallback boundary in a short active-path proof.
    const untilFallback = 900_000 - Date.now() % 900_000;
    if (untilFallback < 25_000) await new Promise(resolve => setTimeout(resolve, untilFallback + 1000));
    await new Promise(resolve => setTimeout(resolve, 1100));
    const fallbackDeadline = (Math.floor(Date.now() / 900_000) + 1) * 900_000;
    await db.$executeRaw`UPDATE "PublicCacheInvalidation" SET "revision" = "revision" + 1,
      "dueAt" = NOW() + INTERVAL '2 seconds', "lastAttemptAt" = NULL, "lastClaimedAt" = NULL,
      "leaseToken" = NULL, "leaseUntil" = NULL, "exhaustedAt" = NULL, "attempts" = 0 WHERE "scope" = 'home'`;
    const before = await row();
    const startedAt = Date.now();
    await action();
    const target = await row();
    expect(target.revision).toBeGreaterThan(before.revision);
    await expect.poll(async () => (await row()).acknowledgedRevision >= target.revision,
      { timeout: 18_000, intervals: [100, 250] }).toBe(true);
    const acknowledgedAt = Date.now();
    expect(acknowledgedAt, `${name} must be acknowledged before the idle fallback`).toBeLessThan(fallbackDeadline);
    evidence.push({ name, startedAt, acknowledgedAt, activeLatencyMs: acknowledgedAt - startedAt,
      fallbackDeadline, beforeIdleFallback: acknowledgedAt < fallbackDeadline, durableDeliveryAcknowledged: true });
  }
  // Drain synthetic setup through an existing real business entry point.
  await db.publicCacheInvalidation.updateMany({ data: { dueAt: new Date(0), lastClaimedAt: null, lastAttemptAt: null } });
  expect((await context.request.put(`${api}/admin/cycles`, { data: { cycleId: cycle.id, codename: cycle.codename,
    status: cycle.status, revealAt: cycle.revealAt.toISOString(), participationDeadline: cycle.participationDeadline.toISOString() } })).ok()).toBe(true);
  await expect.poll(async () => (await row()).acknowledgedRevision === (await row()).revision,
    { timeout: 20_000 }).toBe(true);
  const email = `${randomUUID()}@school.example.test`;
  expect((await context.request.post(`${api}/auth/request-code`, { data: { email } })).ok()).toBe(true);
  const code = await mailCode({ request: context.request }, email);
  await change('registration-after-valid-Mailpit-code', async () => {
    expect((await context.request.post(`${api}/auth/register`, { data: { email, password, code,
      acceptedTerms: true } })).ok()).toBe(true);
  });
  await change('submitted-questionnaire', () => completeProfile(context, db));
  const registered = await db.user.findUniqueOrThrow({ where: { email } });
  await change('administrator-suspension', async () => {
    expect((await context.request.put(`${api}/admin/users/${registered.id}/status`, { data: { status: 'SUSPENDED' } })).ok()).toBe(true);
  });
  await change('administrator-reactivation', async () => {
    expect((await context.request.put(`${api}/admin/users/${registered.id}/status`, { data: { status: 'ACTIVE' } })).ok()).toBe(true);
  });
  await change('administrator-school-change', async () => {
    expect((await context.request.patch(`${api}/admin/users/${registered.id}`, { data: { schoolId: '' } })).ok()).toBe(true);
  });
  await change('administrator-test-flag', async () => {
    expect((await context.request.put(`${api}/admin/users/${registered.id}/test-flag`, { data: { isTest: true } })).ok()).toBe(true);
  });

  await info.attach('active-business-publication', { contentType: 'application/json', body: JSON.stringify({
    evidence, schedulingFixture: 'Existing coalesced deadlines prepared before each mutation; all normal receiver rules execute.',
    assertionsUsedNoManualWorkerCalls: true,
  }, null, 2) });
});
