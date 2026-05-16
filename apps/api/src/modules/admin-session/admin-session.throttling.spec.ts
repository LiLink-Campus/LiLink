import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AdminGuard } from '../../common/auth/admin.guard';
import { CustomThrottlerGuard } from '../../common/http/custom-throttler.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AdminSessionController } from './admin-session.controller';
import { AdminSessionService } from './admin-session.service';
import { ADMIN_LOGIN_THROTTLE_LIMIT } from './admin-session-throttle';

const THROTTLING_SPEC_TIMEOUT_MS = 20_000;

jest.setTimeout(THROTTLING_SPEC_TIMEOUT_MS);

describe('AdminSession throttling', () => {
  it('limits admin login more aggressively than the global default bucket', async () => {
    const adminSessionService = {
      login: jest.fn().mockResolvedValue({
        token: 'admin-token',
        admin: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
        },
      }),
      getMe: jest.fn(),
    };

    const testingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            {
              ttl: 60_000,
              limit: 1000,
            },
          ],
        }),
      ],
      controllers: [AdminSessionController],
      providers: [
        {
          provide: APP_GUARD,
          useClass: CustomThrottlerGuard,
        },
        {
          provide: AdminSessionService,
          useValue: adminSessionService,
        },
        {
          provide: AdminGuard,
          useValue: {
            canActivate: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            adminOperator: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    const app = testingModule.createNestApplication();
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (name: string, value: unknown) => void;
    };

    expressApp.set('trust proxy', 1);
    app.setGlobalPrefix('v1');
    await app.init();

    try {
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
      const loginRequest = () =>
        request(httpServer).post('/v1/admin-session/login').send({
          email: 'admin@example.com',
          password: 'password',
        });

      for (let index = 0; index < ADMIN_LOGIN_THROTTLE_LIMIT; index += 1) {
        await loginRequest().expect(201);
      }

      await loginRequest().expect(429);
      expect(adminSessionService.login).toHaveBeenCalledTimes(
        ADMIN_LOGIN_THROTTLE_LIMIT,
      );
    } finally {
      await app.close();
    }
  });
});
