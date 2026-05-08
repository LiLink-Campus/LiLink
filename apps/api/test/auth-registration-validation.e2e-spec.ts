import {
  CanActivate,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { authEmailThrottler } from '../src/modules/auth/auth-throttle';

@Injectable()
class JwtAuthGuardNoop implements CanActivate {
  canActivate() {
    return true;
  }
}

describe('Auth registration HTTP validation (e2e)', () => {
  let app: INestApplication;
  const requestCode = jest.fn();
  const register = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            { ttl: 60_000, limit: 1_000_000 },
            { ...authEmailThrottler, limit: 1_000_000 },
          ],
        }),
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: AuthService,
          useValue: { requestCode, register },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(JwtAuthGuardNoop)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    requestCode.mockReset();
    register.mockReset();
    requestCode.mockResolvedValue({
      email: 'user@example.com',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      school: { schoolId: 'school-1' },
    });
    register.mockResolvedValue({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const httpServer = () => app.getHttpServer() as Parameters<typeof request>[0];

  describe('POST /v1/auth/request-code', () => {
    it('returns 400 for malformed email addresses', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/request-code')
        .send({ email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(requestCode).not.toHaveBeenCalled();
    });

    it('returns 400 when the email field is missing', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/request-code')
        .send({});

      expect(response.status).toBe(400);
      expect(requestCode).not.toHaveBeenCalled();
    });

    it('returns 400 when unknown JSON properties are present', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/request-code')
        .send({ email: 'user@example.com', extra: 'nope' });

      expect(response.status).toBe(400);
      expect(requestCode).not.toHaveBeenCalled();
    });

    it('returns 200 and forwards the email to AuthService when valid', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/request-code')
        .send({ email: 'user@example.com' });

      expect(response.status).toBe(201);
      expect(requestCode).toHaveBeenCalledTimes(1);
      expect(requestCode).toHaveBeenCalledWith('user@example.com', undefined);
      expect(response.body).toMatchObject({
        email: 'user@example.com',
        school: { schoolId: 'school-1' },
      });
    });
  });

  describe('POST /v1/auth/register', () => {
    it('returns 400 when the verification code length is not six digits', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          code: '12345',
          password: 'Password123',
          displayName: 'Valid Name',
          acceptedTerms: true,
        });

      expect(response.status).toBe(400);
      expect(register).not.toHaveBeenCalled();
    });

    it('returns 400 when the password lacks a digit', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          code: '123456',
          password: 'OnlyLetters',
          displayName: 'Valid Name',
          acceptedTerms: true,
        });

      expect(response.status).toBe(400);
      expect(register).not.toHaveBeenCalled();
    });

    it('returns 400 when terms are not explicitly accepted', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          code: '123456',
          password: 'Password123',
          displayName: 'Valid Name',
          acceptedTerms: false,
        });

      expect(response.status).toBe(400);
      expect(register).not.toHaveBeenCalled();
    });

    it('returns 400 when displayName is shorter than two characters', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          code: '123456',
          password: 'Password123',
          displayName: 'U',
          acceptedTerms: true,
        });

      expect(response.status).toBe(400);
      expect(register).not.toHaveBeenCalled();
    });

    it('returns 200, strips the token from JSON, and calls AuthService when valid', async () => {
      const response = await request(httpServer())
        .post('/v1/auth/register')
        .send({
          email: 'user@example.com',
          code: '123456',
          password: 'Password123',
          displayName: 'Valid Name',
          acceptedTerms: true,
        });

      expect(response.status).toBe(201);
      expect(register).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledWith(
        {
          email: 'user@example.com',
          code: '123456',
          password: 'Password123',
          displayName: 'Valid Name',
          acceptedTerms: true,
        },
        null,
      );
      expect(response.body).toEqual({
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
        },
      });
      expect(response.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringContaining('jwt-token')]),
      );
    });
  });
});
