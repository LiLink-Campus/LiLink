import { ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CustomThrottlerGuard } from '../../common/http/custom-throttler.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { authEmailThrottler, publicAuthRouteThrottles } from './auth-throttle';

type AuthServiceStub = {
  requestCode: jest.Mock;
  register: jest.Mock;
  requestPasswordResetCode: jest.Mock;
  resetPassword: jest.Mock;
  login: jest.Mock;
  getMe: jest.Mock;
};

type EndpointCase = {
  name: string;
  path: string;
  emailLimit: number;
  ipLimit: number;
  serviceMethod: keyof AuthServiceStub;
  buildBody: (email: string) => Record<string, unknown>;
};

const SUCCESS_STATUS = 201;
const SHARED_PROXY_IP = '198.51.100.10';
const SECOND_PROXY_IP = '198.51.100.11';

jest.setTimeout(20_000);

const endpointCases: EndpointCase[] = [
  {
    name: 'request-code',
    path: '/v1/auth/request-code',
    emailLimit: publicAuthRouteThrottles.requestCode.emailLimit,
    ipLimit: publicAuthRouteThrottles.requestCode.ipLimit,
    serviceMethod: 'requestCode',
    buildBody: (email) => ({ email }),
  },
  {
    name: 'register',
    path: '/v1/auth/register',
    emailLimit: publicAuthRouteThrottles.register.emailLimit,
    ipLimit: publicAuthRouteThrottles.register.ipLimit,
    serviceMethod: 'register',
    buildBody: (email) => ({
      email,
      code: '123456',
      password: 'Password123',
      displayName: 'Tester',
      acceptedTerms: true,
    }),
  },
  {
    name: 'request-password-reset-code',
    path: '/v1/auth/request-password-reset-code',
    emailLimit: publicAuthRouteThrottles.requestPasswordResetCode.emailLimit,
    ipLimit: publicAuthRouteThrottles.requestPasswordResetCode.ipLimit,
    serviceMethod: 'requestPasswordResetCode',
    buildBody: (email) => ({ email }),
  },
  {
    name: 'reset-password',
    path: '/v1/auth/reset-password',
    emailLimit: publicAuthRouteThrottles.resetPassword.emailLimit,
    ipLimit: publicAuthRouteThrottles.resetPassword.ipLimit,
    serviceMethod: 'resetPassword',
    buildBody: (email) => ({
      email,
      code: '123456',
      newPassword: 'Password123',
    }),
  },
  {
    name: 'login',
    path: '/v1/auth/login',
    emailLimit: publicAuthRouteThrottles.login.emailLimit,
    ipLimit: publicAuthRouteThrottles.login.ipLimit,
    serviceMethod: 'login',
    buildBody: (email) => ({
      email,
      password: 'Password123',
    }),
  },
];

function createAuthServiceStub(): AuthServiceStub {
  return {
    requestCode: jest.fn((email: string) => ({
      email,
      expiresAt: new Date().toISOString(),
    })),
    register: jest.fn((body: { email: string }) => ({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        email: body.email,
        displayName: 'Tester',
      },
    })),
    requestPasswordResetCode: jest.fn((email: string) => ({
      email,
      expiresAt: new Date().toISOString(),
    })),
    resetPassword: jest.fn((body: { email: string }) => ({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        email: body.email,
        displayName: 'Tester',
      },
    })),
    login: jest.fn((body: { email: string }) => ({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        email: body.email,
        displayName: 'Tester',
      },
    })),
    getMe: jest.fn(),
  };
}

async function createTestApp() {
  const authService = createAuthServiceStub();
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [
          // Kept in sync with AppModule's default bucket.
          {
            ttl: 60_000,
            limit: 1000,
          },
          authEmailThrottler,
        ],
      }),
    ],
    controllers: [AuthController],
    providers: [
      { provide: APP_GUARD, useClass: CustomThrottlerGuard },
      { provide: AuthService, useValue: authService },
      {
        provide: JwtAuthGuard,
        useValue: {
          canActivate: jest.fn(() => true),
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
          user: {
            findUnique: jest.fn(),
          },
        },
      },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (name: string, value: unknown) => void;
  };

  expressApp.set('trust proxy', 1);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.init();

  return {
    app,
    authService,
    httpServer: app.getHttpServer() as Parameters<typeof request>[0],
  };
}

async function postAuth(
  httpServer: Parameters<typeof request>[0],
  path: string,
  proxyIp: string,
  body: Record<string, unknown>,
) {
  return request(httpServer)
    .post(path)
    .set('X-Forwarded-For', proxyIp)
    .send(body);
}

describe('Auth throttling integration', () => {
  describe.each(endpointCases)(
    '$name',
    ({ path, emailLimit, serviceMethod, buildBody }) => {
      it('blocks after the email-specific limit for the same email', async () => {
        const { app, authService, httpServer } = await createTestApp();
        const email = 'same-user@example.com';

        try {
          for (let attempt = 0; attempt < emailLimit; attempt += 1) {
            const response = await postAuth(
              httpServer,
              path,
              SHARED_PROXY_IP,
              buildBody(email),
            );

            expect(response.status).toBe(SUCCESS_STATUS);
          }

          const blockedResponse = await postAuth(
            httpServer,
            path,
            SHARED_PROXY_IP,
            buildBody(email),
          );

          expect(blockedResponse.status).toBe(429);
          expect(authService[serviceMethod]).toHaveBeenCalledTimes(emailLimit);
        } finally {
          await app.close();
        }
      });

      it('keeps different emails isolated behind the same proxy ip', async () => {
        const { app, authService, httpServer } = await createTestApp();
        const firstEmail = 'first-user@example.com';
        const secondEmail = 'second-user@example.com';

        try {
          for (let attempt = 0; attempt < emailLimit; attempt += 1) {
            const response = await postAuth(
              httpServer,
              path,
              SHARED_PROXY_IP,
              buildBody(firstEmail),
            );

            expect(response.status).toBe(SUCCESS_STATUS);
          }

          const independentResponse = await postAuth(
            httpServer,
            path,
            SHARED_PROXY_IP,
            buildBody(secondEmail),
          );

          expect(independentResponse.status).toBe(SUCCESS_STATUS);
          expect(authService[serviceMethod]).toHaveBeenCalledTimes(
            emailLimit + 1,
          );
        } finally {
          await app.close();
        }
      });

      it('does not let the same email bypass throttling by changing proxy ip', async () => {
        const { app, authService, httpServer } = await createTestApp();
        const email = 'rotating-proxy@example.com';

        try {
          for (let attempt = 0; attempt < emailLimit; attempt += 1) {
            const proxyIp =
              attempt % 2 === 0 ? SHARED_PROXY_IP : SECOND_PROXY_IP;
            const response = await postAuth(
              httpServer,
              path,
              proxyIp,
              buildBody(email),
            );

            expect(response.status).toBe(SUCCESS_STATUS);
          }

          const blockedResponse = await postAuth(
            httpServer,
            path,
            SECOND_PROXY_IP,
            buildBody(email),
          );

          expect(blockedResponse.status).toBe(429);
          expect(authService[serviceMethod]).toHaveBeenCalledTimes(emailLimit);
        } finally {
          await app.close();
        }
      });
    },
  );

  it('allows a larger shared-ip burst before the request-code backstop applies', async () => {
    const { app, authService, httpServer } = await createTestApp();
    const { ipLimit } = publicAuthRouteThrottles.requestCode;

    try {
      for (let attempt = 0; attempt < ipLimit; attempt += 1) {
        const response = await postAuth(
          httpServer,
          '/v1/auth/request-code',
          SHARED_PROXY_IP,
          {
            email: `user-${attempt}@example.com`,
          },
        );

        expect(response.status).toBe(SUCCESS_STATUS);
      }

      const blockedResponse = await postAuth(
        httpServer,
        '/v1/auth/request-code',
        SHARED_PROXY_IP,
        {
          email: 'user-over-limit@example.com',
        },
      );

      expect(blockedResponse.status).toBe(429);
      expect(authService.requestCode).toHaveBeenCalledTimes(ipLimit);
    } finally {
      await app.close();
    }
  });

  it('falls back to the trusted proxy client ip when the email is absent', async () => {
    const { app, authService, httpServer } = await createTestApp();
    const emailLimit = publicAuthRouteThrottles.login.emailLimit;

    try {
      for (let attempt = 0; attempt < emailLimit; attempt += 1) {
        const response = await postAuth(
          httpServer,
          '/v1/auth/login',
          SHARED_PROXY_IP,
          {
            password: 'Password123',
          },
        );

        expect(response.status).toBe(400);
      }

      const blockedResponse = await postAuth(
        httpServer,
        '/v1/auth/login',
        SHARED_PROXY_IP,
        {
          password: 'Password123',
        },
      );

      const separateClientResponse = await postAuth(
        httpServer,
        '/v1/auth/login',
        SECOND_PROXY_IP,
        {
          password: 'Password123',
        },
      );

      expect(blockedResponse.status).toBe(429);
      expect(separateClientResponse.status).toBe(400);
      expect(authService.login).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('uses CF-Connecting-IP over X-Forwarded-For when both are present', async () => {
    const { app, authService, httpServer } = await createTestApp();
    const email = 'cf-tracked@example.com';
    const cfIp = '203.0.113.50';
    const { ipLimit } = publicAuthRouteThrottles.requestCode;

    try {
      // Saturate the per-IP bucket for one CF-Connecting-IP. Each request
      // uses a unique email so the per-email bucket never trips first.
      for (let attempt = 0; attempt < ipLimit; attempt += 1) {
        const response = await request(httpServer)
          .post('/v1/auth/request-code')
          .set('X-Forwarded-For', SHARED_PROXY_IP)
          .set('CF-Connecting-IP', cfIp)
          .send({ email: `${attempt}@example.com` });

        expect(response.status).toBe(SUCCESS_STATUS);
      }

      // A different CF-Connecting-IP behind the same X-Forwarded-For edge
      // must get its own bucket (proves we are not bucketing by XFF).
      const otherCfResponse = await request(httpServer)
        .post('/v1/auth/request-code')
        .set('X-Forwarded-For', SHARED_PROXY_IP)
        .set('CF-Connecting-IP', '203.0.113.51')
        .send({ email });

      // The original CF-Connecting-IP must now be rate-limited.
      const sameCfResponse = await request(httpServer)
        .post('/v1/auth/request-code')
        .set('X-Forwarded-For', SHARED_PROXY_IP)
        .set('CF-Connecting-IP', cfIp)
        .send({ email });

      expect(otherCfResponse.status).toBe(SUCCESS_STATUS);
      expect(sameCfResponse.status).toBe(429);
      expect(authService.requestCode).toHaveBeenCalledTimes(ipLimit + 1);
    } finally {
      await app.close();
    }
  });

  it('keeps throttling buckets isolated per auth route', async () => {
    const { app, authService, httpServer } = await createTestApp();
    const email = 'route-isolation@example.com';
    const emailLimit = publicAuthRouteThrottles.requestCode.emailLimit;

    try {
      for (let attempt = 0; attempt < emailLimit; attempt += 1) {
        const response = await postAuth(
          httpServer,
          '/v1/auth/request-code',
          SHARED_PROXY_IP,
          {
            email,
          },
        );

        expect(response.status).toBe(SUCCESS_STATUS);
      }

      const blockedRequestCodeResponse = await postAuth(
        httpServer,
        '/v1/auth/request-code',
        SHARED_PROXY_IP,
        {
          email,
        },
      );

      const loginResponse = await postAuth(
        httpServer,
        '/v1/auth/login',
        SHARED_PROXY_IP,
        {
          email,
          password: 'Password123',
        },
      );

      expect(blockedRequestCodeResponse.status).toBe(429);
      expect(loginResponse.status).toBe(SUCCESS_STATUS);
      expect(authService.requestCode).toHaveBeenCalledTimes(emailLimit);
      expect(authService.login).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
