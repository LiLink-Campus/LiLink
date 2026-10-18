import { PublicService } from '../public/public.service';
import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

import {
  DEFAULT_LOCALE,
  normalizeLocale,
  type SupportedLocale,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { isUniqueConstraintError } from '../../common/prisma/errors';
import { MailService } from '../../common/mail/mail.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import {
  lockSchoolCatalog,
  resolveSchoolEmail,
} from '../../common/schools/school-catalog';

import { RegisterDto, LoginDto, ResetPasswordDto } from './dto';
import { ReferralService } from '../referral/referral.service';
import {
  VerificationCodes,
  VERIFICATION_CODE_TTL_MS,
  type TransactionClient,
} from './verification-codes';

@Injectable()
export class AuthService {
  private readonly codes: VerificationCodes;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly schoolResolverService: SchoolResolverService,
    private readonly jwtService: JwtService,
    // Optional so existing unit tests can construct AuthService without a stub;
    // the running app injects it (AuthModule imports ReferralModule). Drives
    // personal referral code generation and the frozen campaign attribution
    // recorded on the new user.
    private readonly referralService?: ReferralService,
    @Optional() private readonly publicService?: PublicService,
  ) {
    this.codes = new VerificationCodes(prisma, mailService);
  }

  async requestCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const school = await this.resolveSchoolByEmail(normalizedEmail);

    const result = await this.codes.send(normalizedEmail, 'register');

    return {
      ...result,
      school,
      registrationMode: school ? 'SCHOOL_EMAIL' : 'ORDINARY_EMAIL',
    };
  }

  async register(input: RegisterDto, localeCookie?: SupportedLocale | null) {
    const normalizedEmail = input.email.trim().toLowerCase();
    await this.codes.assertValid(
      this.prisma,
      normalizedEmail,
      'register',
      input.code,
    );
    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      await lockSchoolCatalog(tx, 'read');
      const school = await resolveSchoolEmail(tx, normalizedEmail);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalizedEmail}, 0))`;
      const claimed = await tx.user.findUnique({
        where: { educationEmail: normalizedEmail },
        select: { id: true },
      });
      if (claimed)
        throw new BadRequestException('This email is already registered.');
      const schoolId = school
        ? school.schoolId
        : await this.resolveManualSchoolId(tx, input.manualSchoolId);

      // Attribution is optional and never grants education verification.
      const attribution =
        (await this.referralService?.resolveRegistrationAttribution(
          {
            referralCode: input.referralCode,
            channel: input.channel,
            campaignSlug: input.campaignSlug,
          },
          tx,
        )) ?? {
          referredByUserId: null,
          referralChannel: null,
          referralCampaignId: null,
          isDevMockReferral: false,
        };

      await this.codes.consume(tx, normalizedEmail, 'register', input.code);

      const now = new Date();

      try {
        return await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            status: 'ACTIVE',
            displayName: null,
            preferredLocale: localeCookie ?? undefined,
            schoolId,
            educationVerifiedAt: school ? now : null,
            educationVerificationMethod: school ? 'SCHOOL_EMAIL' : null,
            educationEmail: school ? normalizedEmail : null,
            referredByUserId: attribution.referredByUserId,
            referralChannel: attribution.referralChannel,
            referralCampaignId: attribution.referralCampaignId,
            nonEduReferralLimit: school ? 3 : 0,
            acceptedTermsAt: input.acceptedTerms ? now : null,
            lastLoginAt: now,
            lastActiveAt: now,
            profile: {
              create: {},
            },
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new BadRequestException('This email is already registered.');
        }

        throw error;
      }
    });

    this.publicService?.invalidateLandingCache();

    // Assign a personal referral code after the user exists. Idempotent and
    // self-contained (never throws); the referral page can re-trigger it.
    if (this.referralService) {
      await this.referralService.assignReferralCodeIfMissing(user.id);
    }

    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.sessionVersion,
      user.preferredLocale,
      localeCookie,
    );
  }

  async requestPasswordResetCode(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.deactivatedAt) {
      return {
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      };
    }

    // Defer status enforcement to resetPassword so this request step stays
    // indistinguishable across existing accounts.
    return this.codes.send(normalizedEmail, 'password_reset');
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

    this.assertUserActive(existingUser.status, existingUser.deactivatedAt);

    const newPasswordHash = await argon2.hash(input.newPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const transactionalUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!transactionalUser) {
        throw new BadRequestException('No valid verification code was found.');
      }

      this.assertUserActive(
        transactionalUser.status,
        transactionalUser.deactivatedAt,
      );

      await this.codes.consume(
        tx,
        normalizedEmail,
        'password_reset',
        input.code,
      );

      const now = new Date();

      return tx.user.update({
        where: { id: transactionalUser.id },
        data: {
          passwordHash: newPasswordHash,
          sessionVersion: { increment: 1 },
          lastLoginAt: now,
          lastActiveAt: now,
        },
      });
    });

    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.sessionVersion,
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

    this.assertUserActive(user.status, user.deactivatedAt);

    const isValidPassword = await argon2.verify(
      user.passwordHash,
      input.password,
    );
    if (!isValidPassword) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    const now = new Date();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: now, lastActiveAt: now },
      select: { id: true },
    });

    // Keep the version from the password snapshot across concurrent resets.
    return this.issueAuthPayload(
      user.id,
      user.email,
      user.displayName,
      user.sessionVersion,
      user.preferredLocale,
      localeCookie,
    );
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: {
        passwordHash: true,
        meetupExpirationWeeks: true,
        sessionVersion: true,
      },
      include: {
        school: true,
        profile: true,
        questionnaireResponse: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    if (user.deactivatedAt || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended.');
    }

    return user;
  }

  private assertUserActive(status: string, deactivatedAt?: Date | null) {
    if (deactivatedAt)
      throw new UnauthorizedException('Account has been deactivated.');
    if (status === 'ACTIVE') return;

    if (status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended.');
    }

    throw new UnauthorizedException('Account is not active yet.');
  }

  private async resolveSchoolByEmail(email: string) {
    const school = await this.schoolResolverService.resolveByEmail(email);
    if (!school) {
      return null;
    }

    return school;
  }

  private async resolveManualSchoolId(
    tx: TransactionClient,
    manualSchoolId?: string | null,
  ) {
    const schoolId = manualSchoolId?.trim();
    if (!schoolId) {
      return null;
    }

    const school = await tx.school.findUnique({
      where: { id: schoolId },
      select: { id: true, registrationEligible: true },
    });

    if (!school) {
      throw new BadRequestException('Selected school is invalid.');
    }

    return school.id;
  }

  private issueAuthPayload(
    userId: string,
    email: string,
    displayName: string | null,
    sessionVersion: number,
    preferredLocale: unknown = DEFAULT_LOCALE,
    localeCookie?: SupportedLocale | null,
  ) {
    const token = this.jwtService.sign({
      sub: userId,
      email,
      sessionVersion,
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
}
