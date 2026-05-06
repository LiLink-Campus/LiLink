import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type SupportedLocale,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import { env } from '../../config/env';
import { RegisterDto, LoginDto, ResetPasswordDto } from './dto';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

type VerificationCodePurpose = 'register' | 'password_reset';

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_CODE_HMAC_CONTEXT = 'verification-code';
const USABLE_VERIFICATION_CODE_DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SENT',
] as const;
const REGISTRATION_CAPACITY_LOCK_KEY = 120_404_260;
const MAX_REGISTRATIONS_SETTING_KEY = 'max_registrations';
const REGISTRATION_CAPACITY_LIMIT_PATTERN = /^\d+$/;
const UNLIMITED_REGISTRATION_CAPACITY_LIMIT = 0;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly schoolResolverService: SchoolResolverService,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const school = await this.resolveAllowedSchool(normalizedEmail);

    const result = await this.sendVerificationCode(normalizedEmail, 'register');

    return { ...result, school };
  }

  async register(input: RegisterDto, localeCookie?: SupportedLocale | null) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const school = await this.resolveAllowedSchool(normalizedEmail);
    await this.assertRegistrationCapacityPreflight(this.prisma);
    await this.assertVerificationCodeIsValid(
      this.prisma,
      normalizedEmail,
      'register',
      input.code,
    );
    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      await this.assertRegistrationCapacity(tx);
      await this.consumeVerificationCode(
        tx,
        normalizedEmail,
        'register',
        input.code,
      );

      try {
        return await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            status: 'ACTIVE',
            displayName: input.displayName,
            preferredLocale: localeCookie ?? undefined,
            schoolId: school?.schoolId,
            acceptedTermsAt: input.acceptedTerms ? new Date() : null,
            profile: {
              create: {
                fullName: input.fullName,
              },
            },
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          throw new BadRequestException('This email is already registered.');
        }

        throw error;
      }
    });

    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.preferredLocale,
      localeCookie,
    );
  }

  async requestPasswordResetCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return {
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      };
    }

    // Defer status enforcement to resetPassword so this request step stays
    // indistinguishable across existing accounts.
    return this.sendVerificationCode(normalizedEmail, 'password_reset');
  }

  async resetPassword(
    input: ResetPasswordDto,
    localeCookie?: SupportedLocale | null,
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existingUser) {
      throw new BadRequestException('No valid verification code was found.');
    }

    this.assertUserActive(existingUser.status);

    const newPasswordHash = await argon2.hash(input.newPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const transactionalUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!transactionalUser) {
        throw new BadRequestException('No valid verification code was found.');
      }

      this.assertUserActive(transactionalUser.status);

      await this.consumeVerificationCode(
        tx,
        normalizedEmail,
        'password_reset',
        input.code,
      );

      return tx.user.update({
        where: { id: transactionalUser.id },
        data: { passwordHash: newPasswordHash },
      });
    });

    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.preferredLocale,
      localeCookie,
    );
  }

  async login(input: LoginDto, localeCookie?: SupportedLocale | null) {
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    this.assertUserActive(user.status);

    const isValidPassword = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.preferredLocale,
      localeCookie,
    );
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: true },
      include: {
        school: true,
        profile: true,
        questionnaireResponse: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended.');
    }

    return user;
  }

  private assertUserActive(status: string) {
    if (status === 'ACTIVE') return;

    if (status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended.');
    }

    throw new UnauthorizedException('Account is not active yet.');
  }

  private async sendVerificationCode(
    email: string,
    purpose: VerificationCodePurpose,
  ) {
    const code = String(randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    const deliveryDedupeKey = `verification-code:${randomUUID()}`;
    const codeHash = this.createVerificationCodeDigest({
      email,
      purpose,
      deliveryDedupeKey,
      code,
    });
    const queuedEmail = this.mailService.buildVerificationCodeEmail({
      dedupeKey: deliveryDedupeKey,
      recipientEmail: email,
      code,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.emailCode.updateMany({
        where: {
          email,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });

      await tx.emailCode.create({
        data: {
          email,
          codeHash,
          purpose,
          deliveryDedupeKey,
          expiresAt,
        },
      });

      await tx.outboundEmail.create({
        data: queuedEmail,
      });
    });

    // Kick off delivery without blocking the HTTP response. Failures fall
    // through to the 30s cron (`handleEmailQueue`) and are retried up to
    // `maxAttempts`. This keeps /auth/request-code fast enough to absorb
    // traffic spikes (e.g. onboarding cohorts) while preserving at-least-once
    // delivery via the outbound queue.
    void this.mailService
      .deliverQueuedEmailNow(deliveryDedupeKey)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Immediate delivery failed for ${deliveryDedupeKey}; cron will retry. Reason: ${message}`,
        );
      });

    return {
      email,
      expiresAt,
      devCode: env.APP_ENV === 'development' ? code : undefined,
    };
  }

  private async consumeVerificationCode(
    tx: TransactionClient,
    email: string,
    purpose: VerificationCodePurpose,
    code: string,
  ) {
    const latestCode = this.assertVerificationCodeMatches(
      await this.findLatestVerificationCode(tx, email, purpose),
      email,
      purpose,
      code,
    );

    const consumed = await tx.emailCode.updateMany({
      where: { id: latestCode.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new BadRequestException(
        'Verification code is invalid. Please request a new one.',
      );
    }
  }

  private async assertVerificationCodeIsValid(
    store: Pick<TransactionClient, 'emailCode'>,
    email: string,
    purpose: VerificationCodePurpose,
    code: string,
  ) {
    const latestCode = await this.findLatestVerificationCode(
      store,
      email,
      purpose,
    );

    this.assertVerificationCodeMatches(latestCode, email, purpose, code);
  }

  private findLatestVerificationCode(
    store: Pick<TransactionClient, 'emailCode'>,
    email: string,
    purpose: VerificationCodePurpose,
  ) {
    return store.emailCode.findFirst({
      where: {
        email,
        purpose,
        deliveryStatus: {
          in: [...USABLE_VERIFICATION_CODE_DELIVERY_STATUSES],
        },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private assertVerificationCodeMatches(
    latestCode: Awaited<ReturnType<AuthService['findLatestVerificationCode']>>,
    email: string,
    purpose: VerificationCodePurpose,
    code: string,
  ) {
    if (!latestCode) {
      throw new BadRequestException('No valid verification code was found.');
    }

    const isValid = this.matchesVerificationCodeDigest(latestCode.codeHash, {
      email,
      purpose,
      deliveryDedupeKey: latestCode.deliveryDedupeKey,
      code,
    });
    if (!isValid) {
      throw new BadRequestException(
        'Verification code is invalid. Please request a new one.',
      );
    }

    return latestCode;
  }

  private async resolveAllowedSchool(email: string) {
    const resolvedSchool =
      await this.schoolResolverService.resolveByEmail(email);
    if (!resolvedSchool) {
      throw new BadRequestException(
        'This email domain is not currently accepted.',
      );
    }

    return resolvedSchool;
  }

  private createVerificationCodeDigest(input: {
    email: string;
    purpose: VerificationCodePurpose;
    deliveryDedupeKey: string;
    code: string;
  }) {
    return createHmac('sha256', env.JWT_SECRET)
      .update(VERIFICATION_CODE_HMAC_CONTEXT)
      .update('\n')
      .update(input.purpose)
      .update('\n')
      .update(input.email)
      .update('\n')
      .update(input.deliveryDedupeKey)
      .update('\n')
      .update(input.code)
      .digest('hex');
  }

  private matchesVerificationCodeDigest(
    storedDigest: string,
    input: {
      email: string;
      purpose: VerificationCodePurpose;
      deliveryDedupeKey: string;
      code: string;
    },
  ) {
    const expectedDigest = this.createVerificationCodeDigest(input);
    const storedBuffer = Buffer.from(storedDigest);
    const expectedBuffer = Buffer.from(expectedDigest);
    const compareLength = Math.max(storedBuffer.length, expectedBuffer.length);
    const paddedStoredBuffer = Buffer.alloc(compareLength);
    const paddedExpectedBuffer = Buffer.alloc(compareLength);

    storedBuffer.copy(paddedStoredBuffer);
    expectedBuffer.copy(paddedExpectedBuffer);

    return (
      timingSafeEqual(paddedStoredBuffer, paddedExpectedBuffer) &&
      storedBuffer.length === expectedBuffer.length
    );
  }

  private issueAuthPayload(
    userId: string,
    email: string,
    displayName: string | null,
    preferredLocale: unknown = DEFAULT_LOCALE,
    localeCookie?: SupportedLocale | null,
  ) {
    const token = this.jwtService.sign({
      sub: userId,
      email,
      jti: randomUUID(),
    });

    return {
      token,
      user: {
        id: userId,
        email,
        displayName,
        preferredLocale: localeCookie ?? normalizeLocale(preferredLocale),
      },
    };
  }

  private async assertRegistrationCapacity(tx: TransactionClient) {
    const limit = await this.getRegistrationCapacityLimit(tx);
    if (limit <= 0) return;

    // pg_advisory_xact_lock() returns SQL `void`. Prisma 6's $queryRaw refuses
    // to deserialize void columns (P2010), so route the lock through
    // $executeRaw which discards the result set.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${REGISTRATION_CAPACITY_LOCK_KEY})`,
    );

    const currentCount = await tx.user.count();
    this.assertRegistrationCapacityHasSpace(currentCount, limit);
  }

  private async assertRegistrationCapacityPreflight(
    store: Pick<TransactionClient, 'systemSetting' | 'user'>,
  ) {
    const limit = await this.getRegistrationCapacityLimit(store);
    if (limit <= 0) return;

    const currentCount = await store.user.count();
    this.assertRegistrationCapacityHasSpace(currentCount, limit);
  }

  private async getRegistrationCapacityLimit(
    store: Pick<TransactionClient, 'systemSetting'>,
  ) {
    const setting = await store.systemSetting.findUnique({
      where: { key: MAX_REGISTRATIONS_SETTING_KEY },
    });

    return this.parseRegistrationCapacityLimit(setting?.value);
  }

  private parseRegistrationCapacityLimit(settingValue?: string | null) {
    const rawLimit =
      settingValue ?? String(UNLIMITED_REGISTRATION_CAPACITY_LIMIT);

    if (!REGISTRATION_CAPACITY_LIMIT_PATTERN.test(rawLimit)) {
      throw this.createInvalidRegistrationCapacityConfigError();
    }

    const limit = Number(rawLimit);

    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw this.createInvalidRegistrationCapacityConfigError();
    }

    return limit;
  }

  private createInvalidRegistrationCapacityConfigError() {
    return new InternalServerErrorException(
      `${MAX_REGISTRATIONS_SETTING_KEY} must be a non-negative safe integer.`,
    );
  }

  private assertRegistrationCapacityHasSpace(
    currentCount: number,
    limit: number,
  ) {
    if (currentCount < limit) return;

    throw new BadRequestException(
      `本轮内测名额仅限 ${limit} 人，目前已满。请等待下一轮开放。`,
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
