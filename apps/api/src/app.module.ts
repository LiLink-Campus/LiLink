import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './common/mail/mail.module';
import { SchoolModule } from './common/schools/school.module';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { QuestionnaireModule } from './modules/questionnaire/questionnaire.module';
import { AuthModule } from './modules/auth/auth.module';
import { AccountModule } from './modules/account/account.module';
import { CyclesModule } from './modules/cycles/cycles.module';
import { AdminModule } from './modules/admin/admin.module';
import { AdminSessionModule } from './modules/admin-session/admin-session.module';
import { monorepoEnvFilePaths } from './config/monorepo-env-paths';

@Module({
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: monorepoEnvFilePaths(),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 30,
      },
    ]),
    PrismaModule,
    MailModule,
    SchoolModule,
    HealthModule,
    PublicModule,
    QuestionnaireModule,
    AuthModule,
    AccountModule,
    CyclesModule,
    AdminModule,
    AdminSessionModule,
  ],
})
export class AppModule {}
