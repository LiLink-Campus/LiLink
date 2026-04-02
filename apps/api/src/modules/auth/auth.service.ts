import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { SchoolResolverService } from '../../common/schools/school-resolver.service';
import { allowedEmailDomains, env } from '../../config/env';
import { LoginDto, RegisterDto } from './dto';

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
    const domain = normalizedEmail.split('@')[1];

    await this.assertEmailDomainAllowed(domain);

    const code = String(randomInt(100000, 999999));
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.emailCode.create({
      data: {
        email: normalizedEmail,
        codeHash,
        purpose: 'register',
        expiresAt,
      },
    });

    await this.mailService.sendVerificationCode(normalizedEmail, code);

    const school =
      await this.schoolResolverService.resolveByEmail(normalizedEmail);

    return {
      email: normalizedEmail,
      expiresAt,
      school,
      devCode: env.APP_ENV === 'production' ? undefined : code,
    };
  }

  async register(input: RegisterDto) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const school =
      await this.schoolResolverService.resolveByEmail(normalizedEmail);

    const latestCode = await this.prisma.emailCode.findFirst({
      where: {
        email: normalizedEmail,
        purpose: 'register',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestCode) {
      throw new BadRequestException('No valid verification code was found.');
    }

    const isValidCode = await argon2.verify(latestCode.codeHash, input.code);
    if (!isValidCode) {
      await this.prisma.emailCode.update({
        where: { id: latestCode.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException(
        'Verification code is invalid. Please request a new one.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new BadRequestException('This email is already registered.');
    }

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
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

    await this.prisma.emailCode.update({
      where: { id: latestCode.id },
      data: { consumedAt: new Date() },
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

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account has been suspended.');
    }

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
}
