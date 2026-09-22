import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { env } from '../src/config/env';
import { randomUUID } from 'crypto';
import type { Server } from 'node:http';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { MatchLeadsController } from '../src/modules/match-leads/match-leads.module';
import type { AuthenticatedRequest } from '../src/common/auth/jwt-auth.guard';

describe('Account-linked manual registration (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let controller: MatchLeadsController;
  const ids: string[] = [];
  function bodyWithoutConsent(body: {
    realName: string;
    school: string;
    major: string;
    contact: string;
  }) {
    return {
      realName: body.realName,
      school: body.school,
      major: body.major,
      contact: body.contact,
    };
  }
  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    controller = new MatchLeadsController(prisma as PrismaService);
  });
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });
  it('enforces login and admin access over HTTP and rejects forged account fields', async () => {
    const module = await Test.createTestingModule({
      controllers: [MatchLeadsController],
      providers: [JwtService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const app = module.createNestApplication<INestApplication<Server>>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    const server = app.getHttpServer();
    try {
      const body = {
        realName: '测试同学',
        school: '测试大学',
        major: '数学',
        contact: '+8613800138000',
        consent: true,
      };
      await request(server).post('/me/match-leads').send(body).expect(401);
      await request(server).get('/admin/match-leads').expect(401);
      const user = await prisma.user.create({
        data: {
          email: `lead-${randomUUID()}@example.test`,
          passwordHash: 'unused',
          status: 'ACTIVE',
          isTest: true,
        },
      });
      ids.push(user.id);
      const jwt = module
        .get(JwtService)
        .sign({ sub: user.id, email: user.email }, { secret: env.JWT_SECRET });
      const cookie = `${env.COOKIE_NAME}=${jwt}`;
      await request(server)
        .post('/me/match-leads')
        .set('Cookie', cookie)
        .send({ ...body, userId: 'forged' })
        .expect(400);
      await request(server)
        .post('/me/match-leads')
        .set('Cookie', cookie)
        .send(body)
        .expect(201);
      expect(
        await prisma.matchLead.findUnique({ where: { userId: user.id } }),
      ).toMatchObject(bodyWithoutConsent(body));
      await request(server)
        .get('/admin/match-leads')
        .set('Cookie', cookie)
        .expect(401);
    } finally {
      await app.close();
    }
  });
  it('stores all fields, keeps accounts separate, and updates repeat submissions', async () => {
    const users = await Promise.all(
      [1, 2].map(() =>
        prisma.user.create({
          data: {
            email: `lead-${randomUUID()}@example.test`,
            passwordHash: 'unused',
            status: 'ACTIVE',
            isTest: true,
          },
        }),
      ),
    );
    ids.push(...users.map((u) => u.id));
    const body = {
      realName: '测试同学',
      school: '测试大学',
      major: '计算机',
      contact: '+8613800138000',
      consent: true,
    };
    for (const u of users)
      await controller.create(
        { user: { sub: u.id } } as AuthenticatedRequest,
        body,
      );
    let rows = (await controller.list()).filter((r) =>
      users.some((u) => u.id === r.userId),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      realName: body.realName,
      school: body.school,
      major: body.major,
      contact: body.contact,
      user: { id: rows[0].userId },
    });
    expect(rows[0].consentAt).toBeInstanceOf(Date);
    await controller.update(rows[0].id, { contacted: true });
    await controller.create(
      { user: { sub: rows[0].userId! } } as AuthenticatedRequest,
      { ...body, major: '数学' },
    );
    rows = (await controller.list()).filter((r) =>
      users.some((u) => u.id === r.userId),
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.major === '数学')?.contacted).toBe(false);
  });
});
