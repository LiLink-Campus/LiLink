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
import { ReferralService } from '../src/modules/referral/referral.service';

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

  describe('AuthService.register non-edu referral quota (real DB)', () => {
    const NON_EDU_DOMAIN = `lilink-nonedu-${TEST_RUN_TAG}.example`;
    // resolveManualSchoolId only accepts schools flagged registrationEligible.
    // A unique-per-run slug so the suite creates and tears down its own school
    // instead of mutating/deleting a seeded partner school (e.g. bupt-qmul-hainan).
    const MANUAL_SCHOOL_SLUG = `lilink-manual-${TEST_RUN_TAG}`;
    const MANUAL_SCHOOL_DOMAIN = `lilink-manual-${TEST_RUN_TAG}.example`;
    const INELIGIBLE_SCHOOL_SLUG = `lilink-ineligible-${TEST_RUN_TAG}`;
    const INELIGIBLE_SCHOOL_DOMAIN = `lilink-ineligible-${TEST_RUN_TAG}.example`;

    let authService: AuthService;
    let manualSchoolId: string;
    let ineligibleSchoolId: string;

    const seedNonEduCode = async (email: string, code: string) => {
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

    const createReferrer = async (overrides: {
      status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
      limit?: number;
      uses?: number;
    }) => {
      const referralCode = `REF${randomUUID()
        .replace(/-/g, '')
        .slice(0, 12)
        .toUpperCase()}`;
      return prisma.user.create({
        data: {
          email: `referrer-${randomUUID().slice(0, 8)}@${NON_EDU_DOMAIN}`,
          passwordHash: 'placeholder-not-a-real-hash',
          status: overrides.status ?? 'ACTIVE',
          schoolId: manualSchoolId,
          referralCode,
          nonEduReferralLimit: overrides.limit ?? 3,
          nonEduReferralUses: overrides.uses ?? 0,
        },
      });
    };

    beforeAll(async () => {
      // Unique-per-run slugs -> plain create (no upsert), so the suite never
      // matches, mutates, or later deletes a seeded partner school row.
      const manualSchool = await prisma.school.create({
        data: {
          name: `Manual School ${TEST_RUN_TAG}`,
          slug: MANUAL_SCHOOL_SLUG,
          registrationEligible: true,
          domains: { create: [{ domain: MANUAL_SCHOOL_DOMAIN }] },
        },
      });
      manualSchoolId = manualSchool.id;

      const ineligibleSchool = await prisma.school.create({
        data: {
          name: `Ineligible School ${TEST_RUN_TAG}`,
          slug: INELIGIBLE_SCHOOL_SLUG,
          registrationEligible: false,
          domains: { create: [{ domain: INELIGIBLE_SCHOOL_DOMAIN }] },
        },
      });
      ineligibleSchoolId = ineligibleSchool.id;

      const schoolResolver = { resolveByEmail: jest.fn(() => null) };
      const jwtService = new JwtService({ secret: env.JWT_SECRET });
      const mailServiceStub = {
        buildVerificationCodeEmail: jest.fn(),
        deliverQueuedEmailNow: jest.fn().mockResolvedValue(undefined),
      };
      const referralService = new ReferralService(prisma as never);
      authService = new AuthService(
        prisma as never,
        mailServiceStub as never,
        schoolResolver as never,
        jwtService,
        referralService,
      );
    });

    afterEach(async () => {
      await prisma.user.deleteMany({
        where: { email: { endsWith: `@${NON_EDU_DOMAIN}` } },
      });
      await prisma.emailCode.deleteMany({
        where: { email: { endsWith: `@${NON_EDU_DOMAIN}` } },
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { schoolId: manualSchoolId } });
      await prisma.school
        .delete({ where: { id: manualSchoolId } })
        .catch(() => undefined);
      await prisma.school
        .delete({ where: { id: ineligibleSchoolId } })
        .catch(() => undefined);
    });

    it('consumes exactly one quota unit and starts the new non-edu user at limit 0', async () => {
      const referrer = await createReferrer({ limit: 2, uses: 0 });
      const email = `joiner-${randomUUID().slice(0, 8)}@${NON_EDU_DOMAIN}`;
      await seedNonEduCode(email, '654321');

      const result = await authService.register({
        email,
        code: '654321',
        password: 'Password123',
        displayName: 'Joiner',
        acceptedTerms: true,
        referralCode: referrer.referralCode!,
        manualSchoolId,
      });

      expect(result.user.email).toBe(email);
      const persisted = await prisma.user.findUniqueOrThrow({
        where: { email },
      });
      expect(persisted.schoolId).toBe(manualSchoolId);
      expect(persisted.referredByUserId).toBe(referrer.id);
      // A non-edu registrant cannot itself invite other non-edu users.
      expect(persisted.nonEduReferralLimit).toBe(0);

      const refreshedReferrer = await prisma.user.findUniqueOrThrow({
        where: { id: referrer.id },
      });
      expect(refreshedReferrer.nonEduReferralUses).toBe(1);
    });

    it('rejects and rolls back when the referrer quota is exhausted', async () => {
      const referrer = await createReferrer({ limit: 1, uses: 1 });
      const email = `joiner-${randomUUID().slice(0, 8)}@${NON_EDU_DOMAIN}`;
      await seedNonEduCode(email, '111222');

      await expect(
        authService.register({
          email,
          code: '111222',
          password: 'Password123',
          displayName: 'Joiner',
          acceptedTerms: true,
          referralCode: referrer.referralCode!,
          manualSchoolId,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('exhausted') as unknown,
      });

      const refreshedReferrer = await prisma.user.findUniqueOrThrow({
        where: { id: referrer.id },
      });
      expect(refreshedReferrer.nonEduReferralUses).toBe(1);
      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('rejects a code from a non-ACTIVE referrer without consuming quota', async () => {
      const referrer = await createReferrer({
        status: 'SUSPENDED',
        limit: 3,
        uses: 0,
      });
      const email = `joiner-${randomUUID().slice(0, 8)}@${NON_EDU_DOMAIN}`;
      await seedNonEduCode(email, '333444');

      await expect(
        authService.register({
          email,
          code: '333444',
          password: 'Password123',
          displayName: 'Joiner',
          acceptedTerms: true,
          referralCode: referrer.referralCode!,
          manualSchoolId,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining('invalid') as unknown,
      });

      const refreshedReferrer = await prisma.user.findUniqueOrThrow({
        where: { id: referrer.id },
      });
      expect(refreshedReferrer.nonEduReferralUses).toBe(0);
      await expect(
        prisma.user.findUnique({ where: { email } }),
      ).resolves.toBeNull();
    });

    it('rejects a manual school that is not registration-eligible', async () => {
      const referrer = await createReferrer({ limit: 3, uses: 0 });
      const email = `joiner-${randomUUID().slice(0, 8)}@${NON_EDU_DOMAIN}`;
      await seedNonEduCode(email, '555666');

      await expect(
        authService.register({
          email,
          code: '555666',
          password: 'Password123',
          displayName: 'Joiner',
          acceptedTerms: true,
          referralCode: referrer.referralCode!,
          // This school has registrationEligible=false.
          manualSchoolId: ineligibleSchoolId,
        }),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          'Selected school is invalid',
        ) as unknown,
      });

      const refreshedReferrer = await prisma.user.findUniqueOrThrow({
        where: { id: referrer.id },
      });
      expect(refreshedReferrer.nonEduReferralUses).toBe(0);
    });
  });
});
