import { BadRequestException, Logger } from '@nestjs/common';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaClient } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { env, isLocalDevRuntime } from '../../config/env';
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
type VerificationCodePurpose =
  | 'register'
  | 'password_reset'
  | `education:${string}`;
export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_CODE_HMAC_CONTEXT = 'verification-code';
const USABLE_VERIFICATION_CODE_DELIVERY_STATUSES = [
  'PENDING',
  'PROCESSING',
  'SENT',
] as const;

export class VerificationCodes {
  private readonly logger = new Logger(VerificationCodes.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}
  async send(email: string, purpose: VerificationCodePurpose) {
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
    // through to the 1-minute cron (`handleEmailQueue`) and are retried up to
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
      devCode: isLocalDevRuntime() ? code : undefined,
    };
  }

  async consume(
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

  async assertValid(
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
    latestCode: Awaited<
      ReturnType<VerificationCodes['findLatestVerificationCode']>
    >,
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
    if (storedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(storedBuffer, expectedBuffer);
  }
}
