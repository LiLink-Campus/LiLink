import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { createHmac, randomUUID } from 'crypto';
import { PrismaClient } from '../../src/common/prisma/client';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../../src/common/auth/jwt-auth.guard';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AccountController } from '../../src/modules/account/account.controller';
import { AccountProfileService } from '../../src/modules/account/account-profile.service';
import { AccountDashboardService } from '../../src/modules/account/account-dashboard.service';
import { AccountDeletionService } from '../../src/modules/account/account-deletion.service';
import { AccountParticipationService } from '../../src/modules/account/account-participation.service';
import { AccountQuestionnaireService } from '../../src/modules/account/account-questionnaire.service';
import { ContactPreferencesService } from '../../src/modules/account/contact-preferences.service';
import { MatchReportService } from '../../src/modules/account/match-report.service';
import { MatchEstimateService } from '../../src/modules/account/match-estimate.service';
import { env } from '../../src/config/env';

export const jwt = new JwtService({ secret: env.JWT_SECRET });
export const oldPassword = 'SyntheticSession123!';
export const newPassword = 'ReplacementSession456!';

export function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export async function within<T>(promise: Promise<T>) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Session test barrier timed out.')),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function resetCode(prisma: PrismaClient, email: string) {
  const code = '654321';
  const deliveryDedupeKey = `verification-code:${randomUUID()}`;
  const row = await prisma.emailCode.create({
    data: {
      email,
      purpose: 'password_reset',
      deliveryDedupeKey,
      deliveryStatus: 'SENT',
      expiresAt: new Date(Date.now() + 600_000),
      codeHash: createHmac('sha256', env.JWT_SECRET)
        .update(
          `verification-code\npassword_reset\n${email}\n${deliveryDedupeKey}\n${code}`,
        )
        .digest('hex'),
    },
  });
  return { row, input: { email, code, newPassword } };
}

export async function sessionApp(
  prisma: PrismaClient,
): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    controllers: [AuthController, AccountController],
    providers: [
      { provide: JwtService, useValue: jwt },
      { provide: PrismaService, useValue: prisma },
      JwtAuthGuard,
      {
        provide: AuthService,
        useFactory: () =>
          new AuthService(prisma as never, {} as never, {} as never, jwt),
      },
      {
        provide: AccountProfileService,
        useFactory: () =>
          new AccountProfileService(prisma as never, {} as never),
      },
      ...[
        AccountDashboardService,
        AccountDeletionService,
        AccountParticipationService,
        AccountQuestionnaireService,
        ContactPreferencesService,
        MatchReportService,
        MatchEstimateService,
      ].map((provide) => ({ provide, useValue: {} })),
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  return app;
}
