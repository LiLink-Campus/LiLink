import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';

type HealthResponse = {
  ok: boolean;
  service: string;
  timestamp: string;
};

describe('Health endpoint (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

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

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health returns ok', async () => {
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(httpServer).get('/v1/health');
    const body = response.body as HealthResponse;

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe('lilink-api');
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
