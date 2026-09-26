import { randomUUID } from 'node:crypto';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import {
  createPrismaClient,
  type Prisma,
  type PrismaClient,
} from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AccountDashboardService } from '../src/modules/account/account-dashboard.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { buildHardMatchAnswerRecordFromFormInput } from '../src/modules/questionnaire/hard-match';

type VipState = 'free' | 'active' | 'expired' | 'revoked';

describe('matching priority through reveal and dashboard (PostgreSQL)', () => {
  const tag = `priority-${randomUUID()}`;
  const cycleIds: string[] = [];
  let db: PrismaClient;
  let cycles: CyclesService;
  let account: AccountDashboardService;
  let originalCurrent: string[] = [];
  let hardAnswers: Record<string, Prisma.InputJsonValue>;
  const baseTime = Date.now() - 7 * 86400_000;

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      target.hostname !== '127.0.0.1' ||
      !target.port ||
      target.port === '5432' ||
      !/^\/(?:lilink_e2e_[a-f0-9]+|lilink_vip_test_[a-z0-9_]+)$/.test(
        target.pathname,
      )
    ) {
      throw new Error(
        'Requires a disposable local lilink_e2e_* or lilink_vip_test_* database on a non-default port.',
      );
    }
    db = createPrismaClient();
    originalCurrent = (
      await db.questionnaireVersion.findMany({
        where: { isCurrent: true },
        select: { id: true },
      })
    ).map(({ id }) => id);
    await db.school.create({ data: { id: tag, name: tag, slug: tag } });
    await db.questionnaireVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    await db.questionnaireVersion.create({
      data: {
        id: tag,
        title: tag,
        isCurrent: true,
        questions: {
          create: [
            {
              key: 'interest',
              prompt: 'Interest',
              order: 0,
              type: 'SINGLE_SELECT',
              weight: 10,
              options: ['a', 'b'],
            },
          ],
        },
      },
    });
    hardAnswers = buildHardMatchAnswerRecordFromFormInput(
      {
        birthYear: '2000',
        birthMonth: '1',
        birthDay: '1',
        gender: '女',
        partnerGenders: ['女'],
        partnerAgeMin: '18',
        partnerAgeMax: '40',
        nationality: '中国',
        languages: ['中文'],
        partnerNationalities: [],
        partnerLanguages: [],
        looks: '5',
        partnerLooks: Array.from({ length: 10 }, (_, i) => String(i + 1)),
        heightCm: '165',
        weightKg: '55',
        partnerHeightMin: '120',
        partnerHeightMax: '230',
        partnerWeightMin: '',
        partnerWeightMax: '',
        oneLinerIntro: 'Synthetic priority profile',
        excludedPartnerSchools: [],
        excludedPartnerSchoolGenders: [],
      },
      tag,
      [tag],
    );
    const prisma = db as PrismaService;
    const snapshots = new DashboardSnapshotService(prisma);
    const mail = new MailService(prisma);
    jest.spyOn(mail, 'flushQueuedEmails').mockResolvedValue(undefined);
    cycles = new CyclesService(prisma, snapshots, mail);
    account = new AccountDashboardService(prisma, snapshots);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (!db) return;
    try {
      await db.outboundEmail.deleteMany({
        where: { recipientEmail: { startsWith: tag } },
      });
      await db.auditLog.deleteMany({
        where: {
          OR: cycleIds.map((id) => ({
            metadata: { path: ['cycleId'], equals: id },
          })),
        },
      });
      await db.matchCycle.deleteMany({ where: { id: { in: cycleIds } } });
      await db.vipActivation.deleteMany({ where: { batch: tag } });
      await db.user.deleteMany({ where: { schoolId: tag } });
      await db.questionnaireVersion.deleteMany({ where: { id: tag } });
      await db.questionnaireVersion.updateMany({
        where: { id: { in: originalCurrent } },
        data: { isCurrent: true },
      });
      await db.school.deleteMany({ where: { id: tag } });
    } finally {
      await db.$disconnect();
    }
  });

  async function user(
    label: string,
    vip: VipState = 'free',
    interest = 'a',
    overrides = {},
  ) {
    const id = `${tag}-${label}`;
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        displayName: label,
        passwordHash: 'unused-test-hash',
        status: 'ACTIVE',
        schoolId: tag,
        questionnaireResponse: {
          create: {
            versionId: tag,
            submittedAt: new Date(),
            answers: { ...hardAnswers, interest, ...overrides },
          },
        },
        ...(vip === 'free'
          ? {}
          : {
              vipActivations: {
                create: {
                  codeHash: randomUUID(),
                  batch: tag,
                  activatedAt: new Date(baseTime),
                  expiresAt: new Date(
                    Date.now() + (vip === 'expired' ? -86400_000 : 86400_000),
                  ),
                  revokedAt: vip === 'revoked' ? new Date() : null,
                },
              },
            }),
      },
    });
    return id;
  }

  async function cycle(users: string[], revealed = false) {
    const id = `${tag}-cycle-${cycleIds.length}`;
    cycleIds.push(id);
    const revealAt = new Date(baseTime + cycleIds.length * 60_000);
    await db.matchCycle.create({
      data: {
        id,
        codename: id,
        status: revealed ? 'REVEALED' : 'OPEN',
        participationDeadline: new Date(revealAt.getTime() - 1000),
        revealAt,
        participations: {
          create: users.map((userId) => ({
            userId,
            status: 'OPTED_IN',
            intent: 'BOTH',
            optedInAt: new Date(baseTime),
          })),
        },
      },
    });
    return id;
  }

  async function block(left: string, right: string) {
    await db.block.create({ data: { blockerId: left, blockedId: right } });
  }

  async function reveal(cycleId: string, expectedPairs: string[][]) {
    await expect(cycles.runRevealCycle({ cycleId })).resolves.toMatchObject({
      state: 'REVEALED',
      createdMatches: expectedPairs.length,
    });
    const matches = await db.match.findMany({
      where: { cycleId },
      include: { participants: true },
    });
    const keys = (pairs: string[][]) =>
      pairs.map((pair) => [...pair].sort().join('::')).sort();
    expect(
      keys(
        matches.map((match) => match.participants.map(({ userId }) => userId)),
      ),
    ).toEqual(keys(expectedPairs));
    expect(matches.every((match) => match.revealedAt !== null)).toBe(true);
    const participations = await db.cycleParticipation.findMany({
      where: { cycleId },
    });
    const matched = new Set(expectedPairs.flat());
    for (const { userId } of participations) {
      const dashboard = await account.getDashboard(userId);
      expect(dashboard.lastRevealedRound).toMatchObject({
        cycleId,
        matched: matched.has(userId),
      });
      const expectedPair = expectedPairs.find((pair) => pair.includes(userId));
      const history = dashboard.recentMatchHistory.find(
        (round) => round.cycleId === cycleId,
      );
      if (expectedPair) {
        expect(
          dashboard.latestMatch?.participants
            .map((person) => person.userId)
            .sort(),
        ).toEqual([...expectedPair].sort());
        expect(history).toMatchObject({
          result: 'MATCHED',
          visibility: 'VISIBLE',
        });
      } else {
        expect(dashboard.latestMatch).toBeNull();
        expect(history).toMatchObject({ result: 'UNMATCHED', match: null });
      }
    }
  }

  it.each<VipState>(['active', 'expired', 'revoked'])(
    'uses current %s VIP entitlement when allocating a contested candidate',
    async (state) => {
      const vip = await user(`${state}-vip`, state, 'b');
      const free = await user(`${state}-free`);
      const mate = await user(`${state}-mate`);
      await block(vip, free);
      await reveal(await cycle([vip, free, mate]), [
        [state === 'active' ? vip : free, mate],
      ]);
    },
  );

  it('prioritizes the third opt-in over VIP, then clears that priority after success', async () => {
    const priority = await user('unmatched', 'free', 'b');
    const vip = await user('competing-vip', 'active');
    const mate = await user('first-mate');
    const nextMate = await user('next-mate');
    await block(priority, vip);
    await cycle([priority], true);
    await cycle([priority], true);
    await reveal(await cycle([priority, vip, mate]), [[priority, mate]]);
    await reveal(await cycle([priority, vip, nextMate]), [[vip, nextMate]]);
  });

  it('preserves all VIP matches while maximizing remaining free-user matches', async () => {
    const a = await user('max-a', 'active');
    const b = await user('max-b', 'active');
    const c = await user('max-c', 'free', 'b');
    const d = await user('max-d', 'free', 'b');
    await block(a, d);
    await block(b, c);
    await block(c, d);
    await reveal(await cycle([a, b, c, d]), [
      [a, c],
      [b, d],
    ]);
  });

  it('keeps an incompatible VIP unmatched despite two earlier misses', async () => {
    const vip = await user('restricted-vip', 'active', 'a', {
      hard_partner_height_min: 180,
    });
    const mate = await user('restricted-mate');
    await cycle([vip], true);
    await cycle([vip], true);
    await reveal(await cycle([vip, mate]), []);
  });
});
