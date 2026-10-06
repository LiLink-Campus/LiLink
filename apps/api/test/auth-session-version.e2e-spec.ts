// Failure boundaries: stale cookies, rollback, login/reset races and delayed reads.
// Fault injection stays in this disposable test process; production has no hooks.
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { env } from '../src/config/env';
import { AdminService } from '../src/modules/admin/admin.service';
import {
  barrier,
  within,
  jwt,
  oldPassword,
  newPassword,
  resetCode,
  sessionApp,
} from './fixtures/auth-session';

const database = new URL(env.DATABASE_URL);
if (
  database.hostname !== '127.0.0.1' ||
  !database.port ||
  database.port === '5432' ||
  !/^\/lilink_vip_test_[a-f0-9]+$/.test(database.pathname) ||
  !process.env.E2E_OUTPUT
) {
  throw new Error('Session acceptance requires the disposable API E2E runner.');
}
const tag = `session-${randomUUID()}`;
const assertions: string[] = [];
const cookie = (response: request.Response) =>
  String(response.headers['set-cookie'][0]).split(';')[0];
const http = (app: INestApplication) =>
  request(app.getHttpServer() as Parameters<typeof request>[0]);

describe('User session revocation (HTTP + PostgreSQL)', () => {
  let prisma: PrismaClient;
  let app: INestApplication;
  let user: Awaited<ReturnType<PrismaClient['user']['create']>>;
  let oldCookie: string;

  beforeAll(async () => {
    prisma = createPrismaClient();
    app = await sessionApp(prisma);
  });
  beforeEach(async () => {
    user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@${tag}.test`,
        passwordHash: await argon2.hash(oldPassword),
        status: 'ACTIVE',
        displayName: 'Synthetic session account',
        lastActiveAt: new Date(),
      },
    });
    const response = await http(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: oldPassword });
    expect(response.status).toBe(201);
    expect((response.body as { user: object }).user).not.toHaveProperty(
      'sessionVersion',
    );
    oldCookie = cookie(response);
  });
  afterAll(async () => {
    await app?.close();
    if (prisma) {
      await prisma.emailCode.deleteMany({
        where: { email: { endsWith: `@${tag}.test` } },
      });
      await prisma.user.deleteMany({
        where: { email: { endsWith: `@${tag}.test` } },
      });
      await prisma.$disconnect();
    }
    const output = path.join(
      process.env.E2E_OUTPUT!,
      'session-version-assertions.json',
    );
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          environment:
            'disposable loopback PostgreSQL, synthetic users, test-only query barriers',
          command:
            'node scripts/e2e/run.mjs --api auth-session-version.e2e-spec.ts',
          candidateRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: process.env.E2E_SOURCE_ROOT,
            encoding: 'utf8',
          }).trim(),
          expectedAssertions: 8,
          passedAssertions: assertions.length,
          allPassed: assertions.length === 8,
          assertions,
        },
        null,
        2,
      ),
    );
  });

  async function readWrite(session: string, expected: number, target = app) {
    expect(
      (await http(target).get('/v1/auth/me').set('Cookie', session)).status,
    ).toBe(expected);
    expect(
      (
        await http(target)
          .put('/v1/me/locale')
          .set('Cookie', session)
          .send({ locale: 'en-US' })
      ).status,
    ).toBe(expected);
  }

  it('revokes old cookies after each reset, preserves response fields and keeps the new password usable', async () => {
    const before = await http(app).get('/v1/auth/me').set('Cookie', oldCookie);
    const { input } = await resetCode(prisma, user.email);
    const response = await http(app)
      .post('/v1/auth/reset-password')
      .send(input);
    expect(response.status).toBe(201);
    expect(
      Object.keys((response.body as { user: object }).user).sort(),
    ).toEqual(['displayName', 'email', 'id', 'preferredLocale']);
    const newCookie = cookie(response);
    await readWrite(oldCookie, 401);
    await readWrite(newCookie, 200);
    const after = await http(app).get('/v1/auth/me').set('Cookie', newCookie);
    expect(Object.keys(after.body as object).sort()).toEqual(
      Object.keys(before.body as object).sort(),
    );
    expect(after.body).not.toHaveProperty('passwordHash');
    expect(after.body).not.toHaveProperty('sessionVersion');
    expect(after.body).toHaveProperty('profile');
    expect(after.body).toHaveProperty('school');
    expect(
      (
        await http(app)
          .post('/v1/auth/login')
          .send({ email: user.email, password: oldPassword })
      ).status,
    ).toBe(401);
    const login = await http(app)
      .post('/v1/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(login.status).toBe(201);
    await readWrite(cookie(login), 200);
    const nextCode = await resetCode(prisma, user.email);
    const second = await http(app)
      .post('/v1/auth/reset-password')
      .send(nextCode.input);
    expect(second.status).toBe(201);
    await readWrite(newCookie, 401);
    await readWrite(cookie(second), 200);
    assertions.push(
      'two resets revoke previous cookies; new password/session read and write; external auth shapes preserved',
    );
  });

  it('rejects missing, invalid and mismatched versions at baseline zero, then allows fresh login', async () => {
    expect(user.sessionVersion).toBe(0);
    for (const version of [undefined, null, '0', 0.5, -1, 1, true]) {
      const token = jwt.sign({
        sub: user.id,
        email: user.email,
        ...(version === undefined ? {} : { sessionVersion: version }),
      });
      await readWrite(`${env.COOKIE_NAME}=${token}`, 401);
    }
    await readWrite(oldCookie, 200);
    assertions.push(
      'strategy A rejects absent/noninteger/negative/wrong-type/mismatched versions even before any reset',
    );
  });

  it.each(['suspended', 'deactivated'] as const)(
    'still rejects a %s account cookie',
    async (state) => {
      await prisma.user.update({
        where: { id: user.id },
        data:
          state === 'suspended'
            ? { status: 'SUSPENDED' }
            : { deactivatedAt: new Date() },
      });
      await readWrite(oldCookie, 401);
      assertions.push(`${state} account rejected on protected read and write`);
    },
  );

  it('rolls password, code consumption and revocation back when the reset transaction fails', async () => {
    const { row, input } = await resetCode(prisma, user.email);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    const failing = prisma.$extends({
      query: {
        user: {
          async update({ args, query }) {
            const result = await query(args);
            if (args.data.passwordHash)
              throw new Error('Synthetic reset transaction failure');
            return result;
          },
        },
      },
    });
    const failingApp = await sessionApp(failing as unknown as PrismaClient);
    try {
      expect(
        (await http(failingApp).post('/v1/auth/reset-password').send(input))
          .status,
      ).toBe(500);
      const persisted = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(persisted.passwordHash).toBe(before.passwordHash);
      expect(persisted.sessionVersion).toBe(before.sessionVersion);
      expect(
        (await prisma.emailCode.findUniqueOrThrow({ where: { id: row.id } }))
          .consumedAt,
      ).toBeNull();
      await readWrite(oldCookie, 200);
      expect(
        (await http(app).post('/v1/auth/reset-password').send(input)).status,
      ).toBe(201);
      await readWrite(oldCookie, 401);
      assertions.push(
        'transaction failure rolls back password/code/version; old session survives and same code can retry',
      );
    } finally {
      await failingApp.close();
    }
  });

  it('never upgrades a paused old-password login to the post-reset version', async () => {
    const validated = barrier();
    const resume = barrier();
    const delayed = prisma.$extends({
      query: {
        user: {
          async update({ args, query }) {
            if (args.data.lastLoginAt && !args.data.passwordHash) {
              validated.release();
              await within(resume.promise);
            }
            return query(args);
          },
        },
      },
    });
    const delayedApp = await sessionApp(delayed as unknown as PrismaClient);
    const pending = http(delayedApp)
      .post('/v1/auth/login')
      .send({ email: user.email, password: oldPassword })
      .then((r) => r);
    try {
      await within(validated.promise);
      const { input } = await resetCode(prisma, user.email);
      const reset = await http(app).post('/v1/auth/reset-password').send(input);
      expect(reset.status).toBe(201);
      resume.release();
      const login = await pending;
      expect(login.status).toBe(201);
      await readWrite(cookie(login), 401);
      await readWrite(cookie(reset), 200);
      assertions.push(
        'password validated -> reset commits -> login resumes: old login cookie cannot read/write',
      );
    } finally {
      resume.release();
      await pending;
      await delayedApp.close();
    }
  });

  it('does not reuse a delayed pre-reset account read for new old/new-token requests', async () => {
    const captured = barrier();
    const resume = barrier();
    const freshRead = barrier();
    let pause = true;
    const delayed = prisma.$extends({
      query: {
        user: {
          async findUnique({ args, query }) {
            const result = await query(args);
            if (args.select?.status) {
              if (pause) {
                pause = false;
                captured.release();
                await within(resume.promise);
              } else freshRead.release();
            }
            return result;
          },
        },
      },
    });
    const delayedApp = await sessionApp(delayed as unknown as PrismaClient);
    const inflight = http(delayedApp)
      .get('/v1/auth/me')
      .set('Cookie', oldCookie)
      .then((r) => r);
    const pending: Promise<request.Response>[] = [inflight];
    try {
      await within(captured.promise);
      const { input } = await resetCode(prisma, user.email);
      const reset = await http(app).post('/v1/auth/reset-password').send(input);
      expect(reset.status).toBe(201);
      const stale = http(delayedApp)
        .get('/v1/auth/me')
        .set('Cookie', oldCookie)
        .then((r) => r);
      const fresh = http(delayedApp)
        .get('/v1/auth/me')
        .set('Cookie', cookie(reset))
        .then((r) => r);
      pending.push(stale, fresh);
      await within(freshRead.promise);
      resume.release();
      expect((await stale).status).toBe(401);
      expect((await fresh).status).toBe(200);
      expect((await inflight).status).toBe(200);
      assertions.push(
        'delayed pre-reset read may finish; post-reset old/new cookies independently return 401/200',
      );
    } finally {
      resume.release();
      await Promise.allSettled(pending);
      await delayedApp.close();
    }
  });

  it('keeps the existing admin user update response shape without internal revocation state', async () => {
    const admin = new AdminService(
      prisma as never,
      {} as never,
      { write: () => Promise.resolve() } as never,
      {} as never,
      { syncUserMatchSnapshots: () => Promise.resolve() } as never,
    );
    for (const result of [
      await admin.updateUserStatus(
        user.id,
        { status: 'ACTIVE' },
        'synthetic-admin',
      ),
      await admin.updateUser(
        user.id,
        { displayName: 'Updated synthetic account' },
        'synthetic-admin',
      ),
      await admin.updateUserReferralLimit(
        user.id,
        { nonEduReferralLimit: 4 },
        'synthetic-admin',
      ),
    ]) {
      expect(result).not.toHaveProperty('sessionVersion');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('email', user.email);
      expect(result).toHaveProperty('nonEduReferralLimit');
      expect(Object.keys(result).sort()).toEqual(
        Object.keys(user)
          .filter((k) => !['passwordHash', 'sessionVersion'].includes(k))
          .sort(),
      );
    }
    assertions.push(
      'admin status/profile/referral-limit responses preserve existing public fields and omit sessionVersion',
    );
  });
});
