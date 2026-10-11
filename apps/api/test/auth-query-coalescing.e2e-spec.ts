// Failure boundaries: duplicate reads, retained success/failure and cross-account sharing.
// Only disposable HTTP/PostgreSQL instances receive query barriers or observers.
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  createPrismaClientOptions,
  PrismaClient,
} from '../src/common/prisma/client';
import { env } from '../src/config/env';
import {
  assertDisposableSessionDatabase,
  barrier,
  within,
  jwt,
  oldPassword,
  sessionApp,
} from './fixtures/auth-session';

assertDisposableSessionDatabase();
const tag = `coalescing-${randomUUID()}`;
const assertions: object[] = [];
const observedClient = () =>
  new PrismaClient({
    ...createPrismaClientOptions(),
    log: [{ emit: 'event' as const, level: 'query' as const }],
  });
const http = (app: INestApplication) =>
  request(app.getHttpServer() as Parameters<typeof request>[0]);

describe('In-flight identity reads (HTTP + PostgreSQL)', () => {
  let prisma: ReturnType<typeof observedClient>;
  let user: Awaited<ReturnType<PrismaClient['user']['create']>>;
  let session: string;
  let observeSql = false;
  let identitySql = 0;

  beforeAll(() => {
    prisma = observedClient();
    prisma.$on('query', (event) => {
      if (
        observeSql &&
        event.query.startsWith('SELECT') &&
        event.query.includes('"sessionVersion"') &&
        event.query.includes('"lastActiveAt"')
      ) {
        identitySql++;
      }
    });
  });
  beforeEach(async () => {
    observeSql = false;
    identitySql = 0;
    user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@${tag}.test`,
        passwordHash: await argon2.hash(oldPassword),
        status: 'ACTIVE',
        displayName: 'Synthetic concurrent account',
        lastActiveAt: new Date(),
      },
    });
    const loginApp = await sessionApp(prisma as unknown as PrismaClient);
    try {
      const login = await http(loginApp)
        .post('/v1/auth/login')
        .send({ email: user.email, password: oldPassword });
      expect(login.status).toBe(201);
      session = String(login.headers['set-cookie'][0]).split(';')[0];
    } finally {
      await loginApp.close();
    }
    observeSql = true;
  });
  afterAll(async () => {
    observeSql = false;
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${tag}.test` } },
    });
    await prisma.$disconnect();
    const output = path.join(
      process.env.E2E_OUTPUT!,
      'auth-coalescing-assertions.json',
    );
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          environment:
            'disposable loopback PostgreSQL, synthetic HTTP sessions, test-only barriers',
          command:
            'node scripts/e2e/run.mjs --api auth-query-coalescing.e2e-spec.ts auth-session-version.e2e-spec.ts',
          expectedAssertions: 3,
          passedAssertions: assertions.length,
          allPassed: assertions.length === 3,
          assertions,
        },
        null,
        2,
      ),
    );
  });

  const update = (app: INestApplication, token = session) =>
    http(app)
      .put('/v1/me/locale')
      .set('Cookie', token)
      .send({ locale: 'en-US' })
      .then((response) => response);

  it('shares one SELECT across overlapping requests and rechecks after settlement', async () => {
    const captured = barrier();
    const resume = barrier();
    const admitted = barrier();
    let reads = 0;
    let verifications = 0;
    const observed = prisma.$extends({
      query: {
        user: {
          async findUnique({ args, query }) {
            const result = await query(args);
            if (args.select?.sessionVersion) {
              reads++;
              captured.release();
              await within(resume.promise);
            }
            return result;
          },
        },
      },
    });
    const app = await sessionApp(observed as unknown as PrismaClient, () => {
      if (++verifications === 5) admitted.release();
    });
    const pending = [update(app)];
    try {
      await within(captured.promise);
      pending.push(...Array.from({ length: 4 }, () => update(app)));
      await within(admitted.promise);
      resume.release();
      const responses = await Promise.all(pending);
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200, 200, 200,
      ]);
      for (const response of responses)
        expect(response.body).toHaveProperty('id', user.id);
      expect(reads).toBe(1);
      expect(identitySql).toBe(1);
      const burst = {
        requests: 5,
        identityReads: reads,
        identitySelects: identitySql,
      };
      expect((await update(app)).status).toBe(200);
      expect(reads).toBe(2);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });
      expect((await update(app)).status).toBe(401);
      expect(reads).toBe(3);
      expect(identitySql).toBe(3);
      assertions.push({
        scenario: 'overlap and fresh state after settlement',
        burst,
        laterIdentitySelects: 2,
        changedStatusRejected: true,
      });
    } finally {
      resume.release();
      await Promise.allSettled(pending);
      await app.close();
    }
  });

  it('shares a failed read only with current waiters and retries on a later request', async () => {
    const captured = barrier();
    const resume = barrier();
    const admitted = barrier();
    let reads = 0;
    let verifications = 0;
    const observed = prisma.$extends({
      query: {
        user: {
          async findUnique({ args, query }) {
            const first = args.select?.sessionVersion && ++reads === 1;
            const result = await query(args);
            if (first) {
              captured.release();
              await within(resume.promise);
              throw new Error('Synthetic identity read failure');
            }
            return result;
          },
        },
      },
    });
    const app = await sessionApp(observed as unknown as PrismaClient, () => {
      if (++verifications === 3) admitted.release();
    });
    const pending = [update(app)];
    try {
      await within(captured.promise);
      pending.push(update(app), update(app));
      await within(admitted.promise);
      resume.release();
      expect(
        (await Promise.all(pending)).map((response) => response.status),
      ).toEqual([500, 500, 500]);
      expect(reads).toBe(1);
      expect((await update(app)).status).toBe(200);
      expect(reads).toBe(2);
      assertions.push({
        scenario: 'failed overlap then recovery',
        sharedFailures: 3,
        identityReads: reads,
        nextRequestSucceeded: true,
      });
    } finally {
      resume.release();
      await Promise.allSettled(pending);
      await app.close();
    }
  });

  it('keeps another account independent while the first identity read is paused', async () => {
    const captured = barrier();
    const resume = barrier();
    const peer = await prisma.user.create({
      data: {
        email: `${randomUUID()}@${tag}.test`,
        passwordHash: user.passwordHash,
        status: 'ACTIVE',
        lastActiveAt: new Date(),
      },
    });
    const peerSession = `${env.COOKIE_NAME}=${jwt.sign({ sub: peer.id, sessionVersion: 0 })}`;
    const observed = prisma.$extends({
      query: {
        user: {
          async findUnique({ args, query }) {
            const result = await query(args);
            if (args.select?.sessionVersion && args.where.id === user.id) {
              captured.release();
              await within(resume.promise);
            }
            return result;
          },
        },
      },
    });
    const app = await sessionApp(observed as unknown as PrismaClient);
    const pending = update(app);
    try {
      await within(captured.promise);
      const independent = await within(update(app, peerSession));
      expect(independent.status).toBe(200);
      expect(independent.body).toHaveProperty('id', peer.id);
      resume.release();
      expect((await pending).body).toHaveProperty('id', user.id);
      assertions.push({
        scenario: 'account isolation',
        independentRequestSucceeded: true,
        principalMatchesOnBothRequests: true,
      });
    } finally {
      resume.release();
      await pending;
      await app.close();
    }
  });
});
