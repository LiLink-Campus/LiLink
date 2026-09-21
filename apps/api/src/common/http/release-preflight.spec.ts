import { Controller, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { env } from '../../config/env';
import { releaseMaintenance } from './release-maintenance';

@Controller('acceptance')
class AcceptanceController {
  @Post()
  write() {
    return { accepted: true };
  }
}

@Module({ controllers: [AcceptanceController] })
class AcceptanceModule {}

describe('Maintenance browser preflight', () => {
  it('permits CORS negotiation without allowing unauthenticated business requests', async () => {
    const original = {
      maintenance: env.RELEASE_MAINTENANCE,
      key: env.RELEASE_ACCESS_KEY,
    };
    env.RELEASE_MAINTENANCE = true;
    env.RELEASE_ACCESS_KEY = 'controlled-browser-access-1234567890';
    const origin = 'https://release.example.test';
    const app = await NestFactory.create<NestExpressApplication>(
      AcceptanceModule,
      { logger: false, cors: { origin: [origin], credentials: true } },
    );
    app.use(cookieParser());
    app.use(releaseMaintenance);
    try {
      await app.init();
      const server = app.getHttpServer();
      await request(server)
        .options('/acceptance')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect(204)
        .expect('Access-Control-Allow-Origin', origin)
        .expect('Access-Control-Allow-Credentials', 'true');
      await request(server)
        .post('/acceptance')
        .set('Origin', origin)
        .expect(503);
      await request(server)
        .post('/acceptance')
        .set('Origin', origin)
        .set('Cookie', `lilink_release_access=${env.RELEASE_ACCESS_KEY}`)
        .expect(201)
        .expect('Access-Control-Allow-Origin', origin)
        .expect({ accepted: true });
      const deniedOrigin = await request(server)
        .options('/acceptance')
        .set('Origin', 'https://untrusted.example.test')
        .set('Access-Control-Request-Method', 'POST');
      expect(
        deniedOrigin.headers['access-control-allow-origin'],
      ).toBeUndefined();
    } finally {
      await app.close();
      env.RELEASE_MAINTENANCE = original.maintenance;
      env.RELEASE_ACCESS_KEY = original.key;
    }
  });
});
