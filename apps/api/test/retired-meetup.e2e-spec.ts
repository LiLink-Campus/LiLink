import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { env } from '../src/config/env';
import { AccountDeletionService } from '../src/modules/account/account-deletion.service';

const tag = `retired-meetup-${randomUUID()}`;
const password = 'RetiredMeetup123!';

describe('Retired meetup routes (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.matchCycle.deleteMany({ where: { codename: tag } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  it('hides existing sessions after deactivation and registers no reminder cron', async () => {
    const passwordHash = await argon2.hash(password);
    const users = await Promise.all(
      ['left', 'right'].map((side) =>
        prisma.user.create({
          data: {
            email: `${side}@${tag}.example.invalid`,
            displayName: `${tag}-${side}-private-name`,
            status: 'ACTIVE',
            passwordHash,
          },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));
    const now = new Date();
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: tag,
        status: 'REVEALED',
        participationDeadline: now,
        revealAt: now,
      },
    });
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        revealedAt: now,
        introducedAt: now,
        participants: {
          create: users.map((user, position) => ({
            userId: user.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
      include: { participants: true },
    });
    const privateNote = `${tag}-private-message`;
    const session = await prisma.meetupSession.create({
      data: {
        matchId: match.id,
        startedByUserId: users[0].id,
        participants: {
          create: match.participants.map((participant) => ({
            userId: participant.userId,
            matchParticipantId: participant.id,
            turnState: 'REQUIRED',
            responseRequiredAt: new Date(Date.now() - 25 * 60 * 60_000),
          })),
        },
        messages: {
          create: {
            actorUserId: users[0].id,
            type: 'PROPOSE',
            noteText: privateNote,
          },
        },
      },
    });
    await app.get(AccountDeletionService).deleteAccount(users[0].id, password);
    const token = await new JwtService().signAsync(
      { sub: users[1].id, email: users[1].email },
      { secret: env.JWT_SECRET },
    );
    const authCookie = `${env.COOKIE_NAME}=${token}`;
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    const activeResponse = await request(httpServer)
      .get('/v1/me/contact-preferences')
      .set('Cookie', authCookie);
    expect(activeResponse.status).toBe(200);

    const sessionPath = `/v1/me/meetup-sessions/${session.id}`;
    const paths = [
      ['get', '/v1/me/meetup-location-candidates'],
      ['get', sessionPath],
      ['post', `/v1/me/matches/${match.id}/meetup/start`],
      ['post', `${sessionPath}/proposals`],
      ['post', `${sessionPath}/options/accept`],
      ['post', `${sessionPath}/proposals/old-proposal/reject`],
      ['post', `${sessionPath}/final-confirm`],
      ['post', `${sessionPath}/revise`],
      ['post', `${sessionPath}/cancel`],
      ['post', `${sessionPath}/seen`],
      ['put', `${sessionPath}/feedback`],
      ['post', `/v1/me/matches/${match.id}/contact`],
    ] as const;
    for (const [method, path] of paths) {
      const response = await request(httpServer)
        [method](path)
        .set('Cookie', authCookie);
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
      expect(response.text).not.toContain(privateNote);
      expect(response.text).not.toContain(users[0].displayName);
    }

    expect(
      [...app.get(SchedulerRegistry).getCronJobs().keys()].some((name) =>
        name.includes('meetup'),
      ),
    ).toBe(false);
    expect(
      await prisma.meetupMessage.findFirstOrThrow({
        where: { sessionId: session.id },
      }),
    ).toMatchObject({ noteText: privateNote });
  });
});
