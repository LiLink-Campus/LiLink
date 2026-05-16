import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/http/custom-throttler.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { DashboardSnapshotModule } from './common/dashboard/dashboard-snapshot.module';
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
import { MeetupModule } from './modules/meetup/meetup.module';
import { monorepoEnvFilePaths } from './config/monorepo-env-paths';
import { authEmailThrottler } from './modules/auth/auth-throttle';

@Module({
  providers: [{ provide: APP_GUARD, useClass: CustomThrottlerGuard }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: monorepoEnvFilePaths(),
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        // Default bucket for all non-auth routes. Sized for shared-egress
        // networks (campus NAT / corporate LAN): ~100 concurrent users can
        // comfortably issue ~10 requests/min each without hitting the cap,
        // while still shutting down scanners that burst above ~17 req/s.
        // Sensitive auth endpoints stay protected via their own @Throttle
        // decorators (see auth-throttle.ts).
        {
          ttl: 60_000,
          limit: 1000,
        },
        authEmailThrottler,
      ],
    }),
    PrismaModule,
    DashboardSnapshotModule,
    MailModule,
    SchoolModule,
    HealthModule,
    PublicModule,
    QuestionnaireModule,
    AuthModule,
    AccountModule,
    MeetupModule,
    CyclesModule,
    AdminModule,
    AdminSessionModule,
  ],
})
export class AppModule {}
