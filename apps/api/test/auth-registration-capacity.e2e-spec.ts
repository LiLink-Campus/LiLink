// End-to-end coverage for registration capacity enforcement against a real
// Postgres. The app must acquire pg_advisory_xact_lock() through $executeRaw so
// the lock statement is executed for its side effect and never depends on
// result-shape deserialization.

import { JwtService } from '@nestjs/jwt';
import {
  createPrismaClient,
  OutboundEmailStatus,
  Prisma,
  PrismaClient,
} from '../src/common/prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { SchoolResolverService } from '../src/common/schools/school-resolver.service';
import { env } from '../src/config/env';
import { AuthService } from '../src/modules/auth/auth.service';

const REGISTRATION_CAPACITY_LOCK_KEY = 120_404_260;
const VERIFICATION_CODE_HMAC_CONTEXT = 'verification-code';
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REGISTRATIONS_KEY = 'max_registrations';

const TEST_RUN_TAG = `${process.pid}-${Date.now()}`;
// Subdomain of a seeded public school domain so SchoolResolverService accepts it
// (only PUBLIC_SUPPORTED_SCHOOL_SLUGS are resolvable).
const TEST_EMAIL_SUFFIX = `e2e-regcap-${TEST_RUN_TAG}.cuc.edu.cn`;

function hashRegistrationCode(input: {
  email: string;
  deliveryDedupeKey: string;
  code: string;
}): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(VERIFICATION_CODE_HMAC_CONTEXT)
    .update('\n')
    .update('register')
    .update('\n')
    .update(input.email)
    .update('\n')
    .update(input.deliveryDedupeKey)
    .update('\n')
    .update(input.code)
    .digest('hex');
}

describe('Registration capacity advisory lock (e2e)', () => {
  let prisma: PrismaClient;
  let testSchoolId: string;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    // CI applies migrations only (no seed). Ensure a public-slug school exists so
    // SchoolResolverService can resolve *.cuc.edu.cn addresses.
    const school = await prisma.school.upsert({
      where: { slug: 'cuc-hainan-international' },
      update: {},
      create: {
        name: '中国传媒大学海南国际学院',
        slug: 'cuc-hainan-international',
        description: '黎安试验区中外合作办学机构',
      },
    });
    for (const domain of ['cuc.cn', 'cuc.edu.cn', 'coventry.ac.uk'] as const) {
      await prisma.schoolDomain.upsert({
        where: { domain },
        update: { schoolId: school.id },
        create: { domain, schoolId: school.id },
      });
    }
    testSchoolId = school.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_SUFFIX}` } },
    });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_SUFFIX}` } },
    });
    await prisma.systemSetting.deleteMany({
      where: { key: MAX_REGISTRATIONS_KEY },
    });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_SUFFIX}` } },
    });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_SUFFIX}` } },
    });
    await prisma.systemSetting.deleteMany({
      where: { key: MAX_REGISTRATIONS_KEY },
    });
  });

  describe('Prisma raw SQL contract for pg_advisory_xact_lock', () => {
    it('runs successfully when invoked through $executeRaw', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_CAPACITY_LOCK_KEY})`,
          );
          return 'acquired';
        }),
      ).resolves.toBe('acquired');
    });
  });

  describe('advisory lock semantics', () => {
    it('serializes concurrent transactions that share the same key', async () => {
      const HOLD_MS = 150;
      const events: string[] = [];

      const holdLock = async (label: string) => {
        await prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw(
              Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_CAPACITY_LOCK_KEY})`,
            );
            events.push(`${label}:acquired`);
            await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
            events.push(`${label}:released`);
          },
          { timeout: 30_000, maxWait: 30_000 },
        );
      };

      const startedAt = Date.now();
      await Promise.all([holdLock('A'), holdLock('B')]);
      const elapsed = Date.now() - startedAt;

      // Parallel execution would finish in ~HOLD_MS; serialization roughly
      // doubles it. A small jitter buffer keeps the assertion stable on
      // slower CI runners.
      expect(elapsed).toBeGreaterThanOrEqual(2 * HOLD_MS - 30);

      expect(events).toHaveLength(4);
      expect(events[1]).toMatch(/:released$/);
      expect(events[2]).toMatch(/:acquired$/);
      expect(events[1]?.split(':')[0]).toBe(events[0]?.split(':')[0]);
      expect(events[3]?.split(':')[0]).toBe(events[2]?.split(':')[0]);
    });
  });

  describe('AuthService.register against a real database', () => {
    let authService: AuthService;

    const seedVerifiedRegistrationCode = async (
      email: string,
      code: string,
    ) => {
      const deliveryDedupeKey = `verification-code:${randomUUID()}`;
      await prisma.emailCode.create({
        data: {
          email,
          codeHash: hashRegistrationCode({ email, deliveryDedupeKey, code }),
          purpose: 'register',
          deliveryDedupeKey,
          deliveryStatus: OutboundEmailStatus.SENT,
          expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        },
      });
    };

    beforeEach(() => {
      const schoolResolver = new SchoolResolverService(prisma as never);
      const jwtService = new JwtService({ secret: env.JWT_SECRET });
      const mailServiceStub = {
        buildVerificationCodeEmail: jest.fn(),
        deliverQueuedEmailNow: jest.fn().mockResolvedValue(undefined),
      };
      authService = new AuthService(
        prisma as never,
        mailServiceStub as never,
        schoolResolver,
        jwtService,
      );
    });

    it('persists a new user when capacity is configured and not full', async () => {
      const baseUserCount = await prisma.user.count();
      await prisma.systemSetting.upsert({
        where: { key: MAX_REGISTRATIONS_KEY },
        update: { value: String(baseUserCount + 100) },
        create: {
          key: MAX_REGISTRATIONS_KEY,
          value: String(baseUserCount + 100),
        },
      });
      const email = `solo-${randomUUID().slice(0, 8)}@${TEST_EMAIL_SUFFIX}`;
      await seedVerifiedRegistrationCode(email, '654321');

      const result = await authService.register({
        email,
        code: '654321',
        password: 'Password123',
        displayName: 'Solo',
        acceptedTerms: true,
      });

      expect(result.user.email).toBe(email);
      expect(typeof result.token).toBe('string');
      const persisted = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      expect(persisted.schoolId).toBe(testSchoolId);
      expect(persisted.status).toBe('ACTIVE');
    });

    it('rejects registration when the capacity limit is already reached', async () => {
      // Pad the user table with at least one synthetic registration so the
      // capacity check is exercised. Without padding the CI database would
      // start empty (count = 0), and `max_registrations = '0'` is treated by
      // parseRegistrationCapacityLimit as "unlimited" -> the registration
      // would silently succeed and this test would not catch a regression.
      await prisma.user.create({
        data: {
          email: `pad-${randomUUID().slice(0, 8)}@${TEST_EMAIL_SUFFIX}`,
          passwordHash: 'placeholder-not-a-real-hash',
          status: 'ACTIVE',
          schoolId: testSchoolId,
        },
      });
      const currentUserCount = await prisma.user.count();
      await prisma.systemSetting.upsert({
        where: { key: MAX_REGISTRATIONS_KEY },
        update: { value: String(currentUserCount) },
        create: {
          key: MAX_REGISTRATIONS_KEY,
          value: String(currentUserCount),
        },
      });
      const email = `full-${randomUUID().slice(0, 8)}@${TEST_EMAIL_SUFFIX}`;
      await seedVerifiedRegistrationCode(email, '111222');

      await expect(
        authService.register({
          email,
          code: '111222',
          password: 'Password123',
          displayName: 'Full',
          acceptedTerms: true,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('内测名额') as unknown,
      });

      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('serializes two concurrent registrations at limit-1 so only one succeeds', async () => {
      const baseUserCount = await prisma.user.count();
      const limit = baseUserCount + 1;
      await prisma.systemSetting.upsert({
        where: { key: MAX_REGISTRATIONS_KEY },
        update: { value: String(limit) },
        create: { key: MAX_REGISTRATIONS_KEY, value: String(limit) },
      });

      const emailA = `race-a-${randomUUID().slice(0, 8)}@${TEST_EMAIL_SUFFIX}`;
      const emailB = `race-b-${randomUUID().slice(0, 8)}@${TEST_EMAIL_SUFFIX}`;
      await seedVerifiedRegistrationCode(emailA, '101010');
      await seedVerifiedRegistrationCode(emailB, '202020');

      const attemptRegistration = (email: string, code: string) =>
        authService.register({
          email,
          code,
          password: 'Password123',
          displayName: 'Racer',
          acceptedTerms: true,
        });
      const results = await Promise.allSettled([
        attemptRegistration(emailA, '101010'),
        attemptRegistration(emailB, '202020'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({
        reason: { message: expect.stringContaining('内测名额') as unknown },
      });
      const finalUserCount = await prisma.user.count();
      expect(finalUserCount).toBe(limit);
    });
  });
});
