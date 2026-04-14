import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomInt, randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import { allowedEmailDomains, env } from '../../config/env';
import { RegisterDto, LoginDto, ResetPasswordDto } from './dto';

type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

type VerificationCodePurpose = 'register' | 'password_reset';

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly schoolResolverService: SchoolResolverService,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const domain = normalizedEmail.split('@')[1] ?? '';

    await this.assertEmailDomainAllowed(domain);

    const school =
      await this.schoolResolverService.resolveByEmail(normalizedEmail);

    const result = await this.sendVerificationCode(
      normalizedEmail,
      'register',
    );

    return { ...result, school };
  }

  async register(input: RegisterDto) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const domain = normalizedEmail.split('@')[1] ?? '';

    await this.assertEmailDomainAllowed(domain);
    await this.assertRegistrationCapacity();

    const school =
      await this.schoolResolverService.resolveByEmail(normalizedEmail);

    const user = await this.prisma.$transaction(async (tx) => {
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
            passwordHash: await argon2.hash(input.password),
            status: 'ACTIVE',
            displayName: input.displayName,
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

    return this.issueAuthPayload(user.id, user.email, user.displayName);
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

  async resetPassword(input: ResetPasswordDto) {
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

    return this.issueAuthPayload(user.id, user.email, user.displayName);
  }

  async login(input: LoginDto) {
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

    return this.issueAuthPayload(user.id, user.email, user.displayName);
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
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
    const deliveryDedupeKey = `verification-code:${randomUUID()}`;
    const queuedEmail = this.mailService.buildVerificationCodeEmail({
      dedupeKey: deliveryDedupeKey,
      recipientEmail: email,
      code,
    });

    const createdCode = await this.prisma.$transaction(async (tx) => {
      await tx.emailCode.updateMany({
        where: {
          email,
          purpose,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });

      const emailCode = await tx.emailCode.create({
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

      return emailCode;
    });

    await this.mailService.flushQueuedEmails({
      dedupeKeys: [deliveryDedupeKey],
    });

    const deliveredCode = await this.prisma.emailCode.findUnique({
      where: { id: createdCode.id },
    });

    if (deliveredCode?.deliveryStatus !== 'SENT') {
      throw new ServiceUnavailableException(
        'Verification email could not be delivered. Please try again later.',
      );
    }

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
    const latestCode = await tx.emailCode.findFirst({
      where: {
        email,
        purpose,
        deliveryStatus: 'SENT',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestCode) {
      throw new BadRequestException('No valid verification code was found.');
    }

    const isValid = await argon2.verify(latestCode.codeHash, code);
    if (!isValid) {
      throw new BadRequestException(
        'Verification code is invalid. Please request a new one.',
      );
    }

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

  private async assertEmailDomainAllowed(domain: string) {
    const domainRecord = await this.schoolResolverService.resolveByEmail(
      `placeholder@${domain}`,
    );
    const envDomains = allowedEmailDomains();

    const envMatch = envDomains.some(
      (allowedDomain) =>
        domain === allowedDomain || domain.endsWith(`.${allowedDomain}`),
    );

    if (!domainRecord && !envMatch) {
      throw new BadRequestException(
        'This email domain is not currently accepted.',
      );
    }
  }

  private issueAuthPayload(
    userId: string,
    email: string,
    displayName: string | null,
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
      },
    };
  }

  private async assertRegistrationCapacity() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'max_registrations' },
    });

    const limit = Number(setting?.value ?? '0');
    if (limit <= 0) return;

    const currentCount = await this.prisma.user.count();
    if (currentCount >= limit) {
      throw new BadRequestException(
        `本轮内测名额仅限 ${limit} 人，目前已满。请等待下一轮开放。`,
      );
    }
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
