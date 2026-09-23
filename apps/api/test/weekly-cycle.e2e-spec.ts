import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import {
  WeeklyCycleService,
  WEEKLY_CYCLE_SETTING_KEY,
} from '../src/modules/cycles/weekly-cycle.service';
import { env } from '../src/config/env';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { CyclesAutomationService } from '../src/modules/cycles/cycles-automation.service';
import { AdminService } from '../src/modules/admin/admin.service';

const now = new Date('2030-04-10T06:00:00Z');
describe('weekly cycles and draft deletion (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let weekly: WeeklyCycleService;
  let admin: AdminService;
  let actor: string;
  const suiteStarted = new Date();
  const ownedNames = [
    '第11周',
    '第12周',
    '第13周',
    '发布验收专用轮次',
    '待删除草稿',
  ];

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port === '5432' ||
      !/^\/lilink_vip_test_/.test(url.pathname)
    )
      throw new Error('Disposable test database required');
    prisma = createPrismaClient();
    expect(await prisma.matchCycle.count()).toBe(0);
    expect(
      await prisma.systemSetting.findUnique({
        where: { key: WEEKLY_CYCLE_SETTING_KEY },
      }),
    ).toBeNull();
    weekly = new WeeklyCycleService(prisma as PrismaService);
    admin = new AdminService(
      prisma as PrismaService,
      { invalidateAutomationSchedule: jest.fn() } as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      weekly,
    );
    actor = (
      await prisma.adminOperator.create({
        data: { email: 'weekly-admin@example.test', passwordHash: 'unused' },
      })
    ).id;
  });
  beforeEach(async () => {
    await prisma.matchCycle.deleteMany({
      where: { codename: { in: ownedNames } },
    });
    await prisma.systemSetting.deleteMany({
      where: { key: WEEKLY_CYCLE_SETTING_KEY },
    });
  });
  afterAll(async () => {
    if (!actor) {
      await prisma?.$disconnect();
      return;
    }
    await prisma.matchCycle.deleteMany({
      where: { codename: { in: ownedNames } },
    });
    await prisma.systemSetting.deleteMany({
      where: { key: WEEKLY_CYCLE_SETTING_KEY },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { adminActorId: actor },
          { action: 'cycle.auto_created', createdAt: { gte: suiteStarted } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { email: 'weekly-user@example.test' },
    });
    await prisma.adminOperator.deleteMany({ where: { id: actor } });
    await prisma.$disconnect();
  });

  async function enable() {
    await prisma.systemSetting.create({
      data: {
        key: WEEKLY_CYCLE_SETTING_KEY,
        value: JSON.stringify({ enabled: true, deadlineHours: 2 }),
      },
    });
  }
  async function seed(
    status: 'DRAFT' | 'OPEN' | 'PREPARING' | 'REVEAL_READY' | 'REVEALED',
    name = '第11周',
  ) {
    return prisma.matchCycle.create({
      data: {
        codename: name,
        status,
        participationDeadline: new Date('2026-06-23T11:00:00Z'),
        revealAt: new Date('2026-06-23T13:00:00Z'),
      },
    });
  }
  it('defaults to disabled without writing cycles', async () => {
    expect(await weekly.getSettings()).toEqual({
      enabled: false,
      deadlineHours: 2,
    });
    expect(await weekly.ensureUpcomingCycle(now)).toBeNull();
    expect(await prisma.matchCycle.count()).toBe(0);
  });
  it('resumes after a long gap and ignores non-weekly drafts without backfilling past weeks', async () => {
    await seed('REVEALED');
    await seed('DRAFT', '发布验收专用轮次');
    await enable();
    const next = await weekly.ensureUpcomingCycle(now);
    expect(next).toMatchObject({
      codename: '第12周',
      status: 'OPEN',
      revealAt: new Date('2030-04-16T13:00:00Z'),
      participationDeadline: new Date('2030-04-16T11:00:00Z'),
    });
    expect(
      await prisma.cycleParticipation.count({ where: { cycleId: next!.id } }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'cycle.auto_created',
          metadata: { path: ['cycleId'], equals: next!.id },
        },
      }),
    ).toBe(1);
  });
  it('serializes concurrent workers and repeated enable requests into one next cycle', async () => {
    await seed('REVEALED');
    await Promise.all(
      Array.from({ length: 6 }, () =>
        weekly.updateSettings({ enabled: true, deadlineHours: 2 }, actor),
      ),
    );
    expect(await prisma.matchCycle.count({ where: { status: 'OPEN' } })).toBe(
      1,
    );
    const reopened = new WeeklyCycleService(prisma as PrismaService);
    expect(await reopened.ensureUpcomingCycle()).toBeNull();
    expect((await reopened.getSettings()).enabled).toBe(true);
  });
  it.each(['OPEN', 'PREPARING', 'REVEAL_READY'] as const)(
    'does not create a duplicate while an existing cycle is %s',
    async (status) => {
      await seed(status);
      await enable();
      expect(await weekly.ensureUpcomingCycle(now)).toBeNull();
      expect(await prisma.matchCycle.count()).toBe(1);
    },
  );
  it('opens the next week after reveal and pausing prevents further creation', async () => {
    await seed('REVEALED');
    await enable();
    const next = (await weekly.ensureUpcomingCycle(now))!;
    await prisma.matchCycle.update({
      where: { id: next.id },
      data: { status: 'REVEALED' },
    });
    expect(
      await weekly.ensureUpcomingCycle(new Date('2030-04-16T12:00:00Z')),
    ).toBeNull();
    const successor = await weekly.ensureUpcomingCycle(
      new Date('2030-04-16T13:00:00Z'),
    );
    expect(successor).toMatchObject({
      codename: '第13周',
      revealAt: new Date('2030-04-23T13:00:00Z'),
    });
    await weekly.updateSettings({ enabled: false, deadlineHours: 2 }, actor);
    await prisma.matchCycle.update({
      where: { id: successor!.id },
      data: { status: 'REVEALED' },
    });
    expect(
      await weekly.ensureUpcomingCycle(new Date('2030-04-23T13:00:00Z')),
    ).toBeNull();
  });
  it('deletes an empty draft with an audit and preserves all other cycles', async () => {
    const draft = await seed('DRAFT', '待删除草稿');
    const historical = await seed('REVEALED');
    await admin.deleteCycle(draft.id, actor);
    expect(
      await prisma.matchCycle.findUnique({ where: { id: draft.id } }),
    ).toBeNull();
    expect(
      await prisma.matchCycle.findUnique({ where: { id: historical.id } }),
    ).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'cycle.deleted',
          metadata: { path: ['cycleId'], equals: draft.id },
        },
      }),
    ).toBe(1);
  });
  it.each(['OPEN', 'PREPARING', 'REVEAL_READY', 'REVEALED'] as const)(
    'refuses deletion of %s cycles',
    async (status) => {
      const cycle = await seed(status);
      await expect(admin.deleteCycle(cycle.id, actor)).rejects.toThrow(
        '只能删除',
      );
      expect(await prisma.matchCycle.count()).toBe(1);
    },
  );
  it('refuses a draft with an opted-out participation, even when its visible registration count is zero', async () => {
    const draft = await seed('DRAFT');
    await prisma.user.create({
      data: {
        email: 'weekly-user@example.test',
        passwordHash: 'unused',
        participations: { create: { cycleId: draft.id, status: 'OPTED_OUT' } },
      },
    });
    await expect(admin.deleteCycle(draft.id, actor)).rejects.toThrow(
      '只能删除',
    );
    expect(
      await prisma.cycleParticipation.count({ where: { cycleId: draft.id } }),
    ).toBe(1);
  });
  it('the real scheduler reveals an empty due cycle and opens one successor', async () => {
    const cycle = await seed('OPEN');
    const version = await prisma.questionnaireVersion.create({
      data: { title: 'Weekly fixture', isCurrent: true },
    });
    await enable();
    const cycles = new CyclesService(
      prisma as PrismaService,
      { syncCycleSnapshots: jest.fn() } as never,
      { flushPendingEmails: jest.fn() } as never,
    );
    const automation = new CyclesAutomationService(cycles, weekly);
    const previousEnabled = env.BACKGROUND_JOBS_ENABLED;
    env.BACKGROUND_JOBS_ENABLED = true;
    try {
      await automation.handleTick();
      expect(
        (await prisma.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } }))
          .status,
      ).toBe('REVEALED');
      expect(
        await prisma.matchCycle.count({
          where: { status: 'OPEN', codename: '第12周' },
        }),
      ).toBe(1);
      await automation.handleTick();
      expect(await prisma.matchCycle.count({ where: { status: 'OPEN' } })).toBe(
        1,
      );
    } finally {
      env.BACKGROUND_JOBS_ENABLED = previousEnabled;
      await prisma.questionnaireVersion.delete({ where: { id: version.id } });
    }
  });
});
