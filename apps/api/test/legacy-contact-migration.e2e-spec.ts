import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  createPrismaClient,
  Prisma,
  PrismaClient,
} from '../src/common/prisma/client';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../src/common/prisma/prisma.service';

const migration = readFileSync(
  join(
    __dirname,
    '../prisma/migrations/20260919090000_authorize_legacy_match_contacts/migration.sql',
  ),
  'utf8',
);
const rolloutMigration = '20260911120000_account_deletion';

describe('Legacy contact authorization migration (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let rolloutStartedAt: Date;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    const rows = await prisma.$queryRaw<Array<{ startedAt: Date }>>`
      SELECT MIN("started_at" AT TIME ZONE 'UTC') AS "startedAt"
      FROM "_prisma_migrations"
      WHERE "migration_name" = ${rolloutMigration}
        AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `;
    rolloutStartedAt = rows[0].startedAt;
    expect(rolloutStartedAt).toBeInstanceOf(Date);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedPair(tx: Prisma.TransactionClient) {
    const tag = `legacy-contact-${randomUUID()}`;
    const left = await tx.user.create({
      data: {
        email: `${tag}-left@example.test`,
        passwordHash: 'unused-test-hash',
        status: 'ACTIVE',
        preferredContactChannel: 'WECHAT',
        contactMethods: { create: { type: 'WECHAT', value: `${tag}-wechat` } },
      },
    });
    const right = await tx.user.create({
      data: {
        email: `${tag}-right@example.test`,
        passwordHash: 'unused-test-hash',
        status: 'ACTIVE',
        preferredContactChannel: 'PHONE',
      },
    });
    const cycle = await tx.matchCycle.create({
      data: {
        codename: tag,
        status: 'REVEALED',
        participationDeadline: new Date(rolloutStartedAt.getTime() - 120_000),
        revealAt: new Date(rolloutStartedAt.getTime() - 60_000),
        participations: {
          create: [left, right].map((u) => ({
            userId: u.id,
            status: 'OPTED_IN',
            intent: 'BOTH',
          })),
        },
      },
    });
    const match = await tx.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        revealedAt: cycle.revealAt,
        participants: {
          create: [left, right].map((u, position) => ({
            cycleId: cycle.id,
            userId: u.id,
            position,
          })),
        },
      },
    });
    await tx.userCycleDashboardSnapshot.create({
      data: {
        userId: right.id,
        cycleId: cycle.id,
        cycleRevealAt: cycle.revealAt,
        cycleCodename: cycle.codename,
        participationStatus: 'OPTED_IN',
        result: 'MATCHED',
        visibility: 'VISIBLE',
        matchId: match.id,
        matchPayload: { introducedAt: null, contact: 'stale-private-contact' },
      },
    });
    return { left, right, cycle, match, contact: `${tag}-wechat` };
  }

  async function rollbackTest(
    test: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const rollback = new Error('Roll back synthetic legacy contact fixtures.');
    await expect(
      prisma.$transaction(async (tx) => {
        await test(tx);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  }

  it('authorizes eligible pre-rollout matches once, freezes contacts and sends no old emails', async () => {
    await rollbackTest(async (tx) => {
      const { left, right, match, contact } = await seedPair(tx);
      const beforeEmails = await tx.outboundEmail.count();
      await tx.$executeRawUnsafe(migration);
      const authorized = await tx.match.findUniqueOrThrow({
        where: { id: match.id },
        include: { participants: true },
      });
      expect(authorized.introducedAt).toBeInstanceOf(Date);
      expect(authorized.participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: left.id,
            introducedContactType: 'WECHAT',
            introducedContactValue: contact,
          }),
          expect.objectContaining({
            userId: right.id,
            introducedContactType: 'EMAIL',
            introducedContactValue: right.email,
          }),
        ]),
      );
      expect(
        await tx.userCycleDashboardSnapshot.count({
          where: { matchId: match.id },
        }),
      ).toBe(0);
      expect(await tx.outboundEmail.count()).toBe(beforeEmails);
      await tx.userContactMethod.updateMany({
        where: { userId: left.id },
        data: { value: 'private-change-after-migration' },
      });
      await tx.$executeRawUnsafe(migration);
      expect(
        await tx.match.findUniqueOrThrow({
          where: { id: match.id },
          include: { participants: true },
        }),
      ).toEqual(authorized);
      const snapshots = new DashboardSnapshotService(prisma as PrismaService);
      await snapshots.syncMatchSnapshots(match.id, tx);
      const rebuilt = await tx.userCycleDashboardSnapshot.findFirstOrThrow({
        where: { matchId: match.id, userId: right.id },
      });
      const card = snapshots.readDashboardMatchPayload(rebuilt.matchPayload);
      expect(
        card?.participants.find((p) => p.userId === left.id)?.contact?.value,
      ).toBe(contact);
      expect(await tx.outboundEmail.count()).toBe(beforeEmails);
    });
  });

  it.each([
    'suspended',
    'deactivated',
    'blocked',
    'reported',
    'opted-out',
    'missing-intent',
    'missing-participation',
    'one-participant',
    'unrevealed',
    'new-skipped-then-reactivated',
    'missing-rollout',
  ] as const)('does not authorize %s matches', async (scenario) => {
    await rollbackTest(async (tx) => {
      const { left, right, cycle, match } = await seedPair(tx);
      if (
        scenario === 'suspended' ||
        scenario === 'new-skipped-then-reactivated'
      ) {
        await tx.user.update({
          where: { id: left.id },
          data: { status: 'SUSPENDED' },
        });
      }
      if (scenario === 'new-skipped-then-reactivated') {
        await tx.match.update({
          where: { id: match.id },
          data: { revealedAt: new Date(rolloutStartedAt.getTime() + 1_000) },
        });
        await tx.user.update({
          where: { id: left.id },
          data: { status: 'ACTIVE' },
        });
      }
      if (scenario === 'deactivated')
        await tx.user.update({
          where: { id: left.id },
          data: { deactivatedAt: new Date() },
        });
      if (scenario === 'blocked')
        await tx.block.create({
          data: { blockerId: left.id, blockedId: right.id },
        });
      if (scenario === 'reported')
        await tx.report.create({
          data: {
            reporterId: left.id,
            reportedUserId: right.id,
            matchId: match.id,
            reason: 'test',
          },
        });
      if (scenario === 'opted-out' || scenario === 'missing-intent')
        await tx.cycleParticipation.update({
          where: { cycleId_userId: { cycleId: cycle.id, userId: left.id } },
          data:
            scenario === 'opted-out'
              ? { status: 'OPTED_OUT' }
              : { intent: null },
        });
      if (scenario === 'missing-participation')
        await tx.cycleParticipation.delete({
          where: { cycleId_userId: { cycleId: cycle.id, userId: left.id } },
        });
      if (scenario === 'one-participant')
        await tx.matchParticipant.deleteMany({
          where: { matchId: match.id, userId: left.id },
        });
      if (scenario === 'unrevealed')
        await tx.match.update({
          where: { id: match.id },
          data: { revealedAt: null },
        });
      if (scenario === 'missing-rollout') {
        // Rolled back with the fixtures; no permanent migration-history changes.
        await tx.$executeRaw`UPDATE "_prisma_migrations" SET "finished_at" = NULL WHERE "migration_name" = ${rolloutMigration}`;
      }
      const beforeEmails = await tx.outboundEmail.count();
      await tx.$executeRawUnsafe(migration);
      expect(
        await tx.match.findUniqueOrThrow({ where: { id: match.id } }),
      ).toMatchObject({ introducedAt: null });
      expect(
        await tx.matchParticipant.count({
          where: { matchId: match.id, introducedContactValue: { not: null } },
        }),
      ).toBe(0);
      expect(
        await tx.userCycleDashboardSnapshot.count({
          where: { matchId: match.id },
        }),
      ).toBe(0);
      expect(await tx.outboundEmail.count()).toBe(beforeEmails);
    });
  });

  it('does not overwrite existing introductions or frozen contacts', async () => {
    await rollbackTest(async (tx) => {
      const { left, match } = await seedPair(tx);
      await tx.match.update({
        where: { id: match.id },
        data: { introducedAt: match.revealedAt },
      });
      await tx.matchParticipant.updateMany({
        where: { matchId: match.id, userId: left.id },
        data: {
          introducedContactType: 'WECHAT',
          introducedContactValue: 'original-frozen-contact',
        },
      });
      const before = await tx.match.findUniqueOrThrow({
        where: { id: match.id },
        include: { participants: true },
      });
      await tx.$executeRawUnsafe(migration);
      expect(
        await tx.match.findUniqueOrThrow({
          where: { id: match.id },
          include: { participants: true },
        }),
      ).toEqual(before);
    });
  });
});
