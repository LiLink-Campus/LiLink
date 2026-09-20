import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHmac, randomUUID } from 'crypto';
import {
  createPrismaClient,
  Prisma,
  PrismaClient,
} from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { AccountDeletionService } from '../src/modules/account/account-deletion.service';
import { AdminService } from '../src/modules/admin/admin.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { PublicService } from '../src/modules/public/public.service';
import { env } from '../src/config/env';

const tag = `deactivation-guards-${randomUUID()}`;
const password = 'LocalAccountGuard123!';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Account deactivation access guards (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let schoolId: string;
  let hash: string;
  let snapshots: DashboardSnapshotService;
  let mail: MailService;
  let deletion: AccountDeletionService;
  const userIds: string[] = [];
  const matchIds: string[] = [];
  let index = 0;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    hash = await argon2.hash(password);
    schoolId = (await prisma.school.create({ data: { name: tag, slug: tag } }))
      .id;
    snapshots = new DashboardSnapshotService(prisma as PrismaService);
    mail = new MailService(prisma as PrismaService);
    jest.spyOn(mail, 'flushQueuedEmails').mockResolvedValue(undefined);
    deletion = new AccountDeletionService(
      prisma as PrismaService,
      snapshots,
      new PublicService(prisma as PrismaService),
    );
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await prisma.outboundEmail.deleteMany({
      where: {
        OR: [
          { recipientEmail: { endsWith: `@${tag}.example` } },
          ...matchIds.map((id) => ({
            dedupeKey: { startsWith: `match-introduction:${id}:` },
          })),
        ],
      },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.matchCycle.deleteMany({
      where: { codename: { startsWith: tag } },
    });
    await prisma.user.deleteMany({ where: { schoolId } });
    await prisma.emailCode.deleteMany({
      where: { email: { endsWith: `@${tag}.example` } },
    });
    await prisma.school.delete({ where: { id: schoolId } });
    await prisma.$disconnect();
  });

  async function seedPair() {
    index++;
    const users = await Promise.all(
      ['left', 'right'].map((side) =>
        prisma.user.create({
          data: {
            email: `${side}-${index}@${tag}.example`,
            passwordHash: hash,
            displayName: `${side}-${index}`,
            schoolId,
            status: 'ACTIVE',
            preferredContactChannel: 'WECHAT',
            contactMethods: {
              create: { type: 'WECHAT', value: `${side}-private-${index}` },
            },
          },
        }),
      ),
    );
    userIds.push(...users.map((user) => user.id));
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: `${tag}-${index}`,
        status: 'REVEALED',
        participationDeadline: new Date(Date.now() - 120_000),
        revealAt: new Date(Date.now() - 60_000),
        participations: {
          create: users.map((user) => ({
            userId: user.id,
            status: 'OPTED_IN',
            intent: 'BOTH',
          })),
        },
      },
    });
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        revealedAt: cycle.revealAt,
        participants: {
          create: users.map((user, position) => ({
            userId: user.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    matchIds.push(match.id);
    return { left: users[0], right: users[1], match };
  }

  it.each(['profile', 'status'] as const)(
    'preserves the freed email when an admin %s update races deactivation',
    async (operation) => {
      const { left } = await seedPair();
      const readReady = barrier();
      const releaseRead = barrier();
      const findUnique = prisma.user.findUnique.bind(prisma.user);
      let pauseRead = true;
      const adminPrisma = new Proxy(prisma, {
        get(target, property, receiver) {
          if (property !== 'user')
            return Reflect.get(target, property, receiver) as unknown;
          return new Proxy(target.user, {
            get(delegate, key, delegateReceiver) {
              if (key !== 'findUnique')
                return Reflect.get(delegate, key, delegateReceiver) as unknown;
              return async (args: Prisma.UserFindUniqueArgs) => {
                const user = await findUnique(args);
                if (pauseRead) {
                  pauseRead = false;
                  readReady.release();
                  await releaseRead.promise;
                }
                return user;
              };
            },
          });
        },
      });
      const audit = { write: jest.fn() };
      const admin = new AdminService(
        adminPrisma as PrismaService,
        {} as never,
        audit as never,
        {} as never,
        snapshots,
      );
      const updating =
        operation === 'status'
          ? admin.updateUserStatus(left.id, { status: 'ACTIVE' }, 'test-admin')
          : admin.updateUser(
              left.id,
              { email: left.email, status: 'ACTIVE' },
              'test-admin',
            );
      const rejected = expect(updating).rejects.toThrow('Deactivated accounts');
      try {
        await Promise.race([readReady.promise, updating]);
        await deletion.deleteAccount(left.id, password);
        releaseRead.release();
        await rejected;
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: left.id } }),
        ).toMatchObject({
          email: `deactivated-${left.id}@accounts.invalid`,
          deactivatedEmail: left.email,
          deactivatedAt: expect.any(Date) as Date,
          status: 'SUSPENDED',
        });
        expect(audit.write).not.toHaveBeenCalled();
      } finally {
        releaseRead.release();
        await Promise.allSettled([updating]);
      }
    },
  );

  it('allows the original email to register as a new account after deactivation', async () => {
    const { left } = await seedPair();
    await deletion.deleteAccount(left.id, password);
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
      new JwtService({ secret: env.JWT_SECRET }),
    );
    const registered = await auth.register({
      email: left.email,
      password,
      code,
      acceptedTerms: true,
    });
    userIds.push(registered.user.id);
    expect(registered.user.id).not.toBe(left.id);
    expect(registered.user.email).toBe(left.email);
  });
});
