// Registration persistence and referral eligibility against a real PostgreSQL database.

import { JwtService } from '@nestjs/jwt';
import {
  createPrismaClient,
  OutboundEmailStatus,
  PrismaClient,
} from '../src/common/prisma/client';
import { createHmac, randomUUID } from 'crypto';
import { env } from '../src/config/env';
import { AuthService } from '../src/modules/auth/auth.service';

const VERIFICATION_CODE_HMAC_CONTEXT = 'verification-code';
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_REGISTRATIONS_KEY = 'max_registrations';

const TEST_RUN_TAG = `${process.pid}-${Date.now()}`;
const TEST_EMAIL_DOMAIN = `lilink-reg-${TEST_RUN_TAG}.example`;
const TEST_SCHOOL_SLUG = `lilink-reg-${TEST_RUN_TAG}`;
// Cosmetic value returned by the school resolver stub; never read from
// the DB. Kept unique-per-run so nothing in this suite touches a seeded school.
const TEST_REGISTRATION_SCHOOL_SLUG = `lilink-reg-${TEST_RUN_TAG}`;

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

describe('Registration (e2e)', () => {
  let prisma: PrismaClient;
  let testSchoolId: string;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    const school = await prisma.school.create({
      data: {
        name: `Registration Test School ${TEST_RUN_TAG}`,
        slug: TEST_SCHOOL_SLUG,
        domains: { create: [{ domain: TEST_EMAIL_DOMAIN }] },
      },
    });
    testSchoolId = school.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    });
    await prisma.school.delete({ where: { id: testSchoolId } });
    await prisma.systemSetting.deleteMany({
      where: { key: MAX_REGISTRATIONS_KEY },
    });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { schoolId: testSchoolId } });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    });
    await prisma.systemSetting.deleteMany({
      where: { key: MAX_REGISTRATIONS_KEY },
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
      const schoolResolver = {
        resolveByEmail: jest.fn((email: string) => {
          const normalizedEmail = email.trim().toLowerCase();
          if (!normalizedEmail.endsWith(`@${TEST_EMAIL_DOMAIN}`)) {
            return null;
          }

          return {
            schoolId: testSchoolId,
            matchedDomain: TEST_EMAIL_DOMAIN,
            schoolName: `Registration Test School ${TEST_RUN_TAG}`,
            schoolSlug: TEST_REGISTRATION_SCHOOL_SLUG,
            schoolDescription: null,
            registrationEligible: true,
          };
        }),
      };
      const jwtService = new JwtService({ secret: env.JWT_SECRET });
      const mailServiceStub = {
        buildVerificationCodeEmail: jest.fn(),
        deliverQueuedEmailNow: jest.fn().mockResolvedValue(undefined),
      };
      authService = new AuthService(
        prisma as never,
        mailServiceStub as never,
        schoolResolver as never,
        jwtService,
      );
    });

    it('persists a verified school-email registration', async () => {
      const email = `solo-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
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

    it.each(['1', 'invalid', '-1'])(
      'ignores retired registration limits, including malformed values: %s',
      async (legacyLimit) => {
        await prisma.user.create({
          data: {
            email: `pad-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`,
            passwordHash: 'placeholder-not-a-real-hash',
            status: 'ACTIVE',
            schoolId: testSchoolId,
          },
        });
        await prisma.systemSetting.upsert({
          where: { key: MAX_REGISTRATIONS_KEY },
          update: { value: legacyLimit },
          create: {
            key: MAX_REGISTRATIONS_KEY,
            value: legacyLimit,
          },
        });
        const email = `legacy-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
        await seedVerifiedRegistrationCode(email, '111222');

        const result = await authService.register({
          email,
          code: '111222',
          password: 'Password123',
          displayName: 'Legacy setting ignored',
          acceptedTerms: true,
        });
        expect(result.user.email).toBe(email);
        expect(
          await prisma.user.findUnique({ where: { email } }),
        ).toMatchObject({
          id: result.user.id,
          status: 'ACTIVE',
        });
      },
    );

    it('allows both concurrent registrations to exceed a retired limit', async () => {
      const baseUserCount = await prisma.user.count();
      const limit = baseUserCount + 1;
      await prisma.systemSetting.upsert({
        where: { key: MAX_REGISTRATIONS_KEY },
        update: { value: String(limit) },
        create: { key: MAX_REGISTRATIONS_KEY, value: String(limit) },
      });

      const emailA = `race-a-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
      const emailB = `race-b-${randomUUID().slice(0, 8)}@${TEST_EMAIL_DOMAIN}`;
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
      expect(fulfilled).toHaveLength(2);
      expect(rejected).toHaveLength(0);
      const finalUserCount = await prisma.user.count();
      expect(finalUserCount).toBe(baseUserCount + 2);
    });
  });
});
