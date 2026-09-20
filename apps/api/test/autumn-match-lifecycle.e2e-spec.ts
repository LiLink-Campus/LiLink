import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/auth/jwt-auth.guard';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { AccountController } from '../src/modules/account/account.controller';
import { AccountService } from '../src/modules/account/account.service';
import { AccountDeletionService } from '../src/modules/account/account-deletion.service';
import { MatchEstimateService } from '../src/modules/account/match-estimate.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { PublicService } from '../src/modules/public/public.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { env } from '../src/config/env';
import { DashboardResponseDto } from '../src/modules/account/dto';

const tag = `autumn-${randomUUID()}`;
const password = 'LocalAutumn123!';

function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

describe('Autumn match and account lifecycle (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let snapshots: DashboardSnapshotService;
  let mail: MailService;
  let cycles: CyclesService;
  let deletion: AccountDeletionService;
  let app: INestApplication;
  let schoolId: string;
  let hash: string;
  let index = 0;
  const userIds: string[] = [];
  const jwt = new JwtService({ secret: env.JWT_SECRET });

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    hash = await argon2.hash(password);
    schoolId = (await prisma.school.create({ data: { name: tag, slug: tag } }))
      .id;
    snapshots = new DashboardSnapshotService(prisma as PrismaService);
    mail = new MailService(prisma as PrismaService);
    jest.spyOn(mail, 'flushQueuedEmails').mockResolvedValue(undefined);
    cycles = new CyclesService(prisma as PrismaService, snapshots, mail);
    deletion = new AccountDeletionService(
      prisma as PrismaService,
      snapshots,
      new PublicService(prisma as PrismaService),
    );
    const account = new AccountService(
      prisma as PrismaService,
      {} as never,
      snapshots,
    );
    const module = await Test.createTestingModule({
      controllers: [AccountController],
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma },
        { provide: AccountService, useValue: account },
        { provide: MatchEstimateService, useValue: {} },
        { provide: AccountDeletionService, useValue: deletion },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.outboundEmail.deleteMany({
      where: { recipientEmail: { endsWith: `@${tag}.example` } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { metadata: { path: ['cycleId'], string_contains: tag } },
        ],
      },
    });
    await prisma.matchCycle.deleteMany({
      where: { codename: { startsWith: tag } },
    });
    await prisma.productEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.productEventOutbox.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { schoolId } });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${tag}.example` } },
    });
    await prisma.questionnaireVersion.deleteMany({
      where: { title: { startsWith: tag } },
    });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.$disconnect();
  });

  async function seedPair() {
    index++;
    const left = await prisma.user.create({
      data: {
        email: `left-${index}@${tag}.example`,
        passwordHash: hash,
        displayName: '林和',
        schoolId,
        status: 'ACTIVE',
        preferredContactChannel: 'WECHAT',
        contactMethods: {
          create: { type: 'WECHAT', value: `private-wechat-${index}-${tag}` },
        },
        profile: { create: { headline: '喜欢校园散步。' } },
      },
    });
    const right = await prisma.user.create({
      data: {
        email: `right-${index}@${tag}.example`,
        passwordHash: hash,
        displayName: '陈一诺',
        schoolId,
        status: 'ACTIVE',
      },
    });
    userIds.push(left.id, right.id);
    const cycle = await prisma.matchCycle.create({
      data: {
        id: `${tag}-cycle-${index}`,
        codename: `${tag}-${index}`,
        status: 'REVEAL_READY',
        participationDeadline: new Date(Date.now() - 120_000),
        revealAt: new Date(Date.now() - 60_000),
        participations: {
          create: [left, right].map((user) => ({
            userId: user.id,
            status: 'OPTED_IN',
            intent: 'BOTH',
            optedInAt: new Date(),
          })),
        },
      },
    });
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        participants: {
          create: [left, right].map((user, position) => ({
            userId: user.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    return { left, right, cycle, match };
  }

  const cookie = (id: string, email: string) =>
    `${env.COOKIE_NAME}=${jwt.sign({ sub: id, email })}`;
  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  it('updates only historical display names and preserves redacted cards', async () => {
    const { left, cycle, match } = await seedPair();
    await prisma.matchCycle.update({
      where: { id: cycle.id },
      data: { status: 'REVEALED' },
    });
    await prisma.match.update({
      where: { id: match.id },
      data: { revealedAt: new Date(), introducedAt: new Date() },
    });
    await snapshots.syncMatchSnapshots(match.id);
    const readCards = () =>
      prisma.userCycleDashboardSnapshot.findMany({
        where: { matchId: match.id },
        orderBy: { userId: 'asc' },
      });
    const before = await readCards();
    expect(before).toHaveLength(2);
    for (const displayName of ['新昵称', null]) {
      await prisma.user.update({
        where: { id: left.id },
        data: { displayName },
      });
      await snapshots.syncUserDisplayNameSnapshots(left.id);
      const after = await readCards();
      expect(after.map(({ matchPayload }) => matchPayload)).toEqual(
        before.map(({ matchPayload }) => {
          const payload = matchPayload as unknown as {
            participants: Array<{ userId: string; displayName: string | null }>;
          };
          return {
            ...payload,
            participants: payload.participants.map((participant) =>
              participant.userId === left.id
                ? { ...participant, displayName }
                : participant,
            ),
          };
        }),
      );
      expect(
        after.map(({ userId, cycleId, visibility, limitedReason }) => ({
          userId,
          cycleId,
          visibility,
          limitedReason,
        })),
      ).toEqual(
        before.map(({ userId, cycleId, visibility, limitedReason }) => ({
          userId,
          cycleId,
          visibility,
          limitedReason,
        })),
      );
    }
    await deletion.deleteAccount(left.id, password);
    const redacted = await readCards();
    expect(redacted.some((card) => card.visibility === 'LIMITED')).toBe(true);
    await snapshots.syncUserDisplayNameSnapshots(left.id);
    expect(
      (await readCards()).map(
        ({ matchPayload, visibility, limitedReason }) => ({
          matchPayload,
          visibility,
          limitedReason,
        }),
      ),
    ).toEqual(
      redacted.map(({ matchPayload, visibility, limitedReason }) => ({
        matchPayload,
        visibility,
        limitedReason,
      })),
    );
  });

  it('uses the committed full rebuild for waiting dashboard readers without duplicate writes', async () => {
    const { left, right, cycle, match } = await seedPair();
    await prisma.matchCycle.update({
      where: { id: cycle.id },
      data: { status: 'REVEALED' },
    });
    await prisma.match.update({
      where: { id: match.id },
      data: { revealedAt: new Date(), introducedAt: new Date() },
    });
    const rowsWritten = barrier();
    const allowCommit = barrier();
    const readersQueued = barrier();
    let readers = 0;
    let lazyWrites = 0;
    const client = prisma.$extends({
      query: {
        userCycleDashboardSnapshot: {
          async createMany({ args, query }) {
            const result = await query(args);
            rowsWritten.resolve();
            await allowCommit.promise;
            return result;
          },
          async upsert({ args, query }) {
            lazyWrites++;
            return query(args);
          },
        },
        cycleParticipation: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (typeof args.where?.userId === 'string' && ++readers === 2)
              readersQueued.resolve();
            return result;
          },
        },
      },
    });
    const service = new DashboardSnapshotService(
      client as unknown as PrismaService,
    );
    const rebuild = service.syncCycleSnapshots(cycle.id);
    const coverage: Promise<boolean>[] = [];
    try {
      await rowsWritten.promise;
      for (const user of [left, right])
        coverage.push(
          service.ensureUserSnapshotCoverage({
            userId: user.id,
            recentRevealedCycleIds: [cycle.id],
            existingSnapshotCycleIds: [],
          }),
        );
      await readersQueued.promise;
      expect(
        await prisma.userCycleDashboardSnapshot.count({
          where: { cycleId: cycle.id },
        }),
      ).toBe(0);
    } finally {
      allowCommit.resolve();
      await Promise.all([rebuild, ...coverage]);
    }
    expect(await Promise.all(coverage)).toEqual([true, true]);
    expect(lazyWrites).toBe(0);
    expect(
      await prisma.userCycleDashboardSnapshot.count({
        where: { cycleId: cycle.id },
      }),
    ).toBe(2);
  });

  it.each(['lazy', 'match', 'cycle'] as const)(
    'serializes %s snapshot rebuilds with deactivation without restoring private contacts',
    async (mode) => {
      const { left, right, cycle, match } = await seedPair();
      await prisma.matchCycle.update({
        where: { id: cycle.id },
        data: { status: 'REVEALED' },
      });
      await prisma.match.update({
        where: { id: match.id },
        data: { revealedAt: new Date(), introducedAt: new Date() },
      });

      const readStarted = barrier();
      const resumeRead = barrier();
      const client = prisma.$extends({
        query: {
          match: {
            async $allOperations({ args, query }) {
              const result = await query(args);
              readStarted.resolve();
              await resumeRead.promise;
              return result;
            },
          },
        },
      });
      const concurrentSnapshots = new DashboardSnapshotService(
        client as unknown as PrismaService,
      );
      const sync =
        mode === 'lazy'
          ? concurrentSnapshots.ensureUserSnapshotCoverage({
              userId: right.id,
              recentRevealedCycleIds: [cycle.id],
            })
          : mode === 'match'
            ? concurrentSnapshots.syncMatchSnapshots(match.id)
            : concurrentSnapshots.syncCycleSnapshots(cycle.id);
      let deactivation: Promise<unknown> | undefined;
      try {
        await Promise.race([
          readStarted.promise,
          sync.then(() => {
            throw new Error('Expected a paused snapshot read.');
          }),
        ]);
        deactivation = deletion.deleteAccount(left.id, password);
        // Ensure the deleter has its User lock and is waiting on the Match.
        const deadline = Date.now() + 2_000;
        let waiting = false;
        while (!waiting && Date.now() < deadline) {
          const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database()
                AND wait_event_type = 'Lock'
                AND query LIKE '%FROM "Match"%'
                AND query LIKE '%FOR UPDATE%'
            ) AS waiting
          `;
          waiting = rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
      } finally {
        resumeRead.resolve();
        await Promise.all([sync, deactivation]);
      }

      await snapshots.ensureUserSnapshotCoverage({
        userId: right.id,
        recentRevealedCycleIds: [cycle.id],
      });
      const card = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow({
        where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } },
      });
      expect(card).toMatchObject({
        visibility: 'LIMITED',
        limitedReason: 'ACCOUNT_DEACTIVATED',
        matchPayload: { participants: [] },
      });
      expect(JSON.stringify(card.matchPayload)).not.toContain(left.email);
      expect(JSON.stringify(card.matchPayload)).not.toContain(
        `private-wechat-${index}-${tag}`,
      );
    },
  );

  it('atomically reveals contacts and queues exactly two emails under concurrent reveal', async () => {
    const { left, right, cycle, match } = await seedPair();
    const results = await Promise.all([
      cycles.runRevealCycle({ cycleId: cycle.id }),
      cycles.runRevealCycle({ cycleId: cycle.id }),
    ]);
    expect(
      results.filter(
        (result) => 'state' in result && result.state === 'REVEALED',
      ),
    ).toHaveLength(1);
    const emails = await prisma.outboundEmail.findMany({
      where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
    });
    expect(emails).toHaveLength(2);
    const outcomes = await prisma.productEventOutbox.findMany({
      where: { entityId: match.id },
    });
    expect(outcomes).toHaveLength(0);
    expect(emails.every((row) => row.status === 'PENDING')).toBe(true);
    expect(
      await prisma.matchParticipant.count({
        where: { matchId: match.id, contactRequestedAt: { not: null } },
      }),
    ).toBe(0);

    expect(emails.map((email) => email.recipientEmail).sort()).toEqual(
      [left.email, right.email].sort(),
    );
    expect(emails.every((email) => email.text?.includes('匹配成功'))).toBe(
      true,
    );
    const rightCard = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow(
      { where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } } },
    );
    expect(JSON.stringify(rightCard.matchPayload)).toContain(
      `private-wechat-${index}-${tag}`,
    );
    expect(
      await prisma.match.findUnique({ where: { id: match.id } }),
    ).toMatchObject({ introducedAt: expect.any(Date) as Date });
    await cycles.runRevealCycle({ cycleId: cycle.id });
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(2);
  });

  it.each([
    {
      before: 'WECHAT',
      oldValue: 'private_wechat',
      after: 'QQ',
      newValue: '12345678',
    },
    {
      before: 'QQ',
      oldValue: '87654321',
      after: 'PHONE',
      newValue: '+8613812345678',
    },
  ] as const)(
    'keeps a consistent public contact during $before to $after updates at reveal',
    async ({ before, oldValue, after, newValue }) => {
      const { left, right, cycle, match } = await seedPair();
      await prisma.user.update({
        where: { id: left.id },
        data: {
          preferredContactChannel: before,
          contactMethods: {
            deleteMany: {},
            create: { type: before, value: oldValue },
          },
        },
      });
      const locked = barrier();
      const release = barrier();
      let editorPid = 0;
      const edit = prisma.$transaction(
        async (tx) => {
          const [connection] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          editorPid = connection.pid;
          // Pause the contact read between relation queries in the old implementation.
          await tx.$executeRaw`LOCK TABLE "UserContactMethod" IN ACCESS EXCLUSIVE MODE`;
          locked.resolve();
          await release.promise;
          await tx.user.update({
            where: { id: left.id },
            data: {
              preferredContactChannel: after,
              contactPreferencesRevision: { increment: 1 },
              contactMethods: {
                deleteMany: {},
                create: { type: after, value: newValue },
              },
            },
          });
        },
        { timeout: 15_000 },
      );
      await Promise.race([locked.promise, edit]);
      const reveal = cycles.runRevealCycle({ cycleId: cycle.id });
      // Attach handlers immediately while the test controls both transactions.
      const completed = Promise.allSettled([edit, reveal]);
      let waiting = false;
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          const rows = await prisma.$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE ${editorPid} = ANY(pg_blocking_pids(pid))
                AND query LIKE '%UserContactMethod%'
            ) AS waiting
          `;
          if (rows[0].waiting) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        release.resolve();
        await completed;
      }
      expect(waiting).toBe(true);
      await edit;
      await reveal;
      const frozen = await prisma.matchParticipant.findFirstOrThrow({
        where: { matchId: match.id, userId: left.id },
      });
      expect([
        { type: before, value: oldValue },
        { type: after, value: newValue },
      ]).toContainEqual({
        type: frozen.introducedContactType,
        value: frozen.introducedContactValue,
      });
      const email = await prisma.outboundEmail.findFirstOrThrow({
        where: {
          recipientEmail: right.email,
          dedupeKey: { startsWith: `match-reveal:${match.id}:` },
        },
      });
      expect(email.text).toContain(frozen.introducedContactValue);
      expect(email.text).not.toContain(left.email);
      expect(email.html).not.toContain(left.email);
      const card = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow({
        where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } },
      });
      expect(JSON.stringify(card.matchPayload)).toContain(
        frozen.introducedContactValue,
      );
      expect(JSON.stringify(card.matchPayload)).not.toContain(left.email);
    },
    20_000,
  );

  it('skips a match without participants without aborting the reveal', async () => {
    const { cycle, match } = await seedPair();
    await prisma.matchParticipant.deleteMany({ where: { matchId: match.id } });
    await cycles.runRevealCycle({ cycleId: cycle.id });
    expect(
      await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).toMatchObject({
      revealedAt: expect.any(Date) as Date,
      introducedAt: null,
    });
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: 'match.introduction_skipped',
        metadata: { path: ['matchId'], equals: match.id },
      },
    });
    expect(audit.metadata).toMatchObject({ reason: 'INVALID_PARTICIPANTS' });
  });

  it('rolls back the reveal when email construction fails, and can retry', async () => {
    const { cycle, match } = await seedPair();
    const build = jest
      .spyOn(mail, 'buildMatchRevealEmails')
      .mockImplementationOnce(() => {
        throw new Error('email-build-failure');
      });
    await expect(cycles.runRevealCycle({ cycleId: cycle.id })).rejects.toThrow(
      'email-build-failure',
    );
    expect(
      await prisma.matchCycle.findUnique({ where: { id: cycle.id } }),
    ).toMatchObject({ status: 'REVEAL_READY' });
    expect(
      await prisma.match.findUnique({ where: { id: match.id } }),
    ).toMatchObject({ revealedAt: null, introducedAt: null });
    build.mockRestore();
    await cycles.runRevealCycle({ cycleId: cycle.id });
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(2);
  });

  it('never discloses a skipped introduction through current, historical or cached cards after suspension and reactivation', async () => {
    const { left, right, cycle, match } = await seedPair();
    await prisma.user.update({
      where: { id: left.id },
      data: { status: 'SUSPENDED' },
    });
    await cycles.runRevealCycle({ cycleId: cycle.id });
    expect(
      await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).toMatchObject({
      revealedAt: expect.any(Date) as Date,
      introducedAt: null,
    });
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(0);

    const expectPrivateDashboard = async () => {
      const response = await request(server())
        .get('/v1/me/dashboard')
        .set('Cookie', cookie(right.id, right.email))
        .expect(200);
      const dashboard = response.body as DashboardResponseDto;
      const history = dashboard.recentMatchHistory.find(
        (item) => item.cycleId === cycle.id,
      );
      expect(dashboard.latestMatch).toBeNull();
      expect(dashboard.latestMatchVisibility).toBeNull();
      expect(dashboard.latestMatchLimitedReason).toBeNull();
      expect(dashboard.lastRevealedRound).toMatchObject({ matched: false });
      expect(history).toMatchObject({
        result: 'UNMATCHED',
        visibility: 'NOT_APPLICABLE',
        limitedReason: null,
        match: null,
      });
      expect(JSON.stringify(dashboard)).not.toContain(match.id);
      expect(JSON.stringify(dashboard)).not.toContain(left.id);
      expect(JSON.stringify(dashboard)).not.toContain(left.email);
      expect(JSON.stringify(dashboard)).not.toContain(
        `private-wechat-${index}-${tag}`,
      );
    };

    const snapshot = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow({
      where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } },
    });
    expect(JSON.stringify(snapshot.matchPayload)).not.toContain(left.email);
    expect(JSON.stringify(snapshot.matchPayload)).not.toContain(
      `private-wechat-${index}-${tag}`,
    );
    await expectPrivateDashboard();

    await prisma.userCycleDashboardSnapshot.update({
      where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } },
      data: {
        result: 'MATCHED',
        visibility: 'VISIBLE',
        matchId: match.id,
        matchPayload: {
          id: match.id,
          score: 88,
          introducedAt: null,
          participants: [
            {
              userId: left.id,
              email: left.email,
              contact: {
                type: 'WECHAT',
                label: '微信',
                value: `private-wechat-${index}-${tag}`,
              },
            },
            { userId: right.id, email: right.email, contact: null },
          ],
        },
      },
    });
    await expectPrivateDashboard();
    await prisma.user.update({
      where: { id: left.id },
      data: { status: 'ACTIVE' },
    });
    await snapshots.syncMatchSnapshots(match.id);
    await expectPrivateDashboard();
    await cycles.runRevealCycle({ cycleId: cycle.id });
    await expectPrivateDashboard();
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(0);
    const skipLogs = await prisma.auditLog.findMany({
      where: {
        action: 'match.introduction_skipped',
        metadata: { path: ['matchId'], equals: match.id },
      },
    });
    expect(skipLogs).toHaveLength(1);
    expect(skipLogs[0].metadata).toMatchObject({
      cycleId: cycle.id,
      matchId: match.id,
      reason: 'INELIGIBLE_PARTICIPANT',
      issues: [{ userId: left.id, reason: 'SUSPENDED' }],
    });
    const restored = await request(server())
      .get('/v1/me/dashboard')
      .set('Cookie', cookie(left.id, left.email))
      .expect(200);
    expect((restored.body as DashboardResponseDto).latestMatch).toBeNull();
    expect(
      (restored.body as DashboardResponseDto).recentMatchHistory.find(
        (item) => item.cycleId === cycle.id,
      ),
    ).toMatchObject({ result: 'UNMATCHED', match: null });
  });

  it('preserves introduced contacts when profiles change or accounts are later suspended', async () => {
    const { left, right, cycle, match } = await seedPair();
    await cycles.runRevealCycle({ cycleId: cycle.id });
    const frozenContact = `private-wechat-${index}-${tag}`;
    await prisma.user.update({
      where: { id: left.id },
      data: {
        status: 'SUSPENDED',
        contactMethods: {
          updateMany: {
            where: { type: 'WECHAT' },
            data: { value: 'changed_private_contact' },
          },
        },
      },
    });
    await snapshots.syncMatchSnapshots(match.id);
    const response = await request(server())
      .get('/v1/me/dashboard')
      .set('Cookie', cookie(right.id, right.email))
      .expect(200);
    const dashboard = response.body as DashboardResponseDto;
    const history = dashboard.recentMatchHistory.find(
      (item) => item.cycleId === cycle.id,
    );
    for (const card of [dashboard.latestMatch, history?.match]) {
      expect(card?.introducedAt).toEqual(expect.any(String));
      expect(
        card?.participants.find((p) => p.userId === left.id)?.contact,
      ).toEqual({
        type: 'WECHAT',
        label: '微信号',
        value: frozenContact,
      });
    }
    expect(JSON.stringify(dashboard)).not.toContain('changed_private_contact');
  });

  it('leaves the next cycle empty until users explicitly opt in', async () => {
    const { cycle } = await seedPair();
    await cycles.runRevealCycle({ cycleId: cycle.id });
    const admin = new AdminService(
      prisma as PrismaService,
      cycles,
      { write: jest.fn() } as never,
      {} as never,
      snapshots,
    );
    const next = await admin.upsertCycle(
      {
        codename: `${tag}-next`,
        status: 'OPEN',
        participationDeadline: new Date(Date.now() + 60_000).toISOString(),
        revealAt: new Date(Date.now() + 120_000).toISOString(),
      },
      'test-admin',
    );
    expect(
      await prisma.cycleParticipation.count({ where: { cycleId: next.id } }),
    ).toBe(0);
    const existingCurrent = await prisma.questionnaireVersion.findFirst({
      where: { isCurrent: true },
    });
    const questionnaire =
      existingCurrent ??
      (await prisma.questionnaireVersion.create({
        data: { title: tag, isCurrent: true },
      }));
    try {
      const outcome = await cycles.runRevealCycle({
        cycleId: next.id,
        force: true,
      });
      expect(outcome).toMatchObject({ createdMatches: 0 });
      expect(
        await prisma.cycleParticipation.count({ where: { cycleId: next.id } }),
      ).toBe(0);
    } finally {
      if (!existingCurrent)
        await prisma.questionnaireVersion.delete({
          where: { id: questionnaire.id },
        });
    }
  });

  it('preserves coupons, activations and their ownership when an account is deactivated', async () => {
    const { left } = await seedPair();
    const campaign = await prisma.campaign.create({
      data: { name: tag, slug: tag },
    });
    const merchant = await prisma.merchant.create({ data: { name: tag } });
    const template = await prisma.couponTemplate.create({
      data: {
        campaignId: campaign.id,
        merchantId: merchant.id,
        title: tag,
        benefitType: 'CUSTOM',
        faceValue: 10,
      },
    });
    const activation = await prisma.campaignActivation.create({
      data: { userId: left.id, campaignId: campaign.id },
    });
    const coupon = await prisma.coupon.create({
      data: {
        userId: left.id,
        templateId: template.id,
        code: tag,
        totpSecret: 'test-only',
      },
    });
    try {
      await deletion.deleteAccount(left.id, password);
      expect(
        await prisma.coupon.findUnique({ where: { id: coupon.id } }),
      ).toMatchObject({
        userId: left.id,
        status: 'ISSUED',
        totpSecret: 'test-only',
      });
      expect(
        await prisma.campaignActivation.findUnique({
          where: { id: activation.id },
        }),
      ).toMatchObject({ userId: left.id });
      expect(
        await prisma.couponTemplate.findUnique({ where: { id: template.id } }),
      ).not.toBeNull();
    } finally {
      await prisma.coupon.delete({ where: { id: coupon.id } });
      await prisma.campaignActivation.delete({ where: { id: activation.id } });
      await prisma.couponTemplate.delete({ where: { id: template.id } });
      await prisma.merchant.delete({ where: { id: merchant.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
    }
  });

  it('does not mail or disclose a blocked pair', async () => {
    const { left, right, cycle, match } = await seedPair();
    await prisma.block.create({
      data: { blockerId: left.id, blockedId: right.id },
    });
    await cycles.runRevealCycle({ cycleId: cycle.id });
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
      }),
    ).toBe(0);
    const card = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow({
      where: { userId_cycleId: { userId: left.id, cycleId: cycle.id } },
    });
    expect(card).toMatchObject({
      result: 'UNMATCHED',
      visibility: 'NOT_APPLICABLE',
      limitedReason: null,
      matchPayload: null,
    });
    expect(JSON.stringify(card.matchPayload)).not.toContain(right.email);
  });

  it('requires authentication, password and confirmation before soft deactivation', async () => {
    const { left, right, cycle, match } = await seedPair();
    await cycles.runRevealCycle({ cycleId: cycle.id });
    const retainedVersion = await prisma.questionnaireVersion.create({
      data: { title: `${tag}-retained` },
    });
    await prisma.questionnaireResponse.create({
      data: {
        userId: left.id,
        versionId: retainedVersion.id,
        answers: {},
        submittedAt: new Date(),
      },
    });
    const beforeStats = await new PublicService(
      prisma as PrismaService,
    ).getLandingPayload();
    const beforeUserCount = await prisma.user.count();
    const originalCookie = cookie(left.id, left.email);
    await request(server())
      .delete('/v1/me/account')
      .send({ password, confirmation: '注销账号' })
      .expect(401);
    await request(server())
      .delete('/v1/me/account')
      .set('Cookie', originalCookie)
      .send({ password, confirmation: 'no' })
      .expect(400);
    await request(server())
      .delete('/v1/me/account')
      .set('Cookie', originalCookie)
      .send({ password: 'Incorrect123!', confirmation: '注销账号' })
      .expect(401);
    expect(
      await prisma.user.findUnique({ where: { id: left.id } }),
    ).not.toBeNull();
    const response = await request(server())
      .delete('/v1/me/account')
      .set('Cookie', originalCookie)
      .send({ password, confirmation: '注销账号' })
      .expect(200);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining(`${env.COOKIE_NAME}=`)]),
    );
    expect(
      await prisma.user.findUnique({ where: { id: left.id } }),
    ).toMatchObject({
      deactivatedAt: expect.any(Date) as Date,
      deactivatedEmail: left.email,
      status: 'SUSPENDED',
      displayName: left.displayName,
    });
    expect(
      await prisma.user.findUnique({ where: { email: left.email } }),
    ).toBeNull();
    expect(await prisma.userProfile.count({ where: { userId: left.id } })).toBe(
      1,
    );
    expect(
      await prisma.userContactMethod.count({ where: { userId: left.id } }),
    ).toBe(1);
    expect(
      await prisma.outboundEmail.count({
        where: {
          dedupeKey: { startsWith: `match-reveal:${match.id}:` },
          status: { in: ['PENDING', 'FAILED'] },
        },
      }),
    ).toBe(0);
    await request(server())
      .get('/v1/me/bootstrap')
      .set('Cookie', originalCookie)
      .expect(401);
    const card = await prisma.userCycleDashboardSnapshot.findUniqueOrThrow({
      where: { userId_cycleId: { userId: right.id, cycleId: cycle.id } },
    });
    expect(card).toMatchObject({
      visibility: 'LIMITED',
      limitedReason: 'ACCOUNT_DEACTIVATED',
    });
    expect(JSON.stringify(card.matchPayload)).not.toContain(left.email);

    const afterStats = await new PublicService(
      prisma as PrismaService,
    ).getLandingPayload();
    expect(await prisma.user.count()).toBe(beforeUserCount);
    expect(
      await prisma.questionnaireResponse.count({ where: { userId: left.id } }),
    ).toBe(1);
    expect(afterStats.stats.registeredUsers).toBe(
      beforeStats.stats.registeredUsers - 1,
    );
    expect(afterStats.stats.completedQuestionnaires).toBe(
      beforeStats.stats.completedQuestionnaires - 1,
    );
    expect(afterStats.stats.matchesDelivered).toBe(
      beforeStats.stats.matchesDelivered - 1,
    );
    const admin = new AdminService(
      prisma as PrismaService,
      cycles,
      { write: jest.fn() } as never,
      {} as never,
      snapshots,
    );
    await expect(
      admin.updateUserStatus(left.id, { status: 'ACTIVE' }, 'test-admin'),
    ).rejects.toThrow('Deactivated accounts');
    const deliveryDedupeKey = `verification-code:${randomUUID()}`;
    const code = '654321';
    const codeHash = createHmac('sha256', env.JWT_SECRET)
      .update(
        `verification-code\nregister\n${left.email}\n${deliveryDedupeKey}\n${code}`,
      )
      .digest('hex');
    await prisma.emailCode.create({
      data: {
        email: left.email,
        codeHash,
        purpose: 'register',
        deliveryDedupeKey,
        deliveryStatus: 'SENT',
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    const auth = new AuthService(
      prisma as PrismaService,
      mail,
      {
        resolveByEmail: () =>
          Promise.resolve({ schoolId, registrationEligible: true }),
      } as never,
      jwt,
    );
    const registered = await auth.register({
      email: left.email,
      password,
      code,
      acceptedTerms: true,
    });
    userIds.push(registered.user.id);
    expect(registered.user.id).not.toBe(left.id);
    expect(
      await prisma.cycleParticipation.count({
        where: { userId: registered.user.id },
      }),
    ).toBe(0);
  });
});
