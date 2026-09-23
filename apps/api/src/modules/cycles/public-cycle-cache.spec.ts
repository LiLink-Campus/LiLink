import { MODULE_METADATA } from '@nestjs/common/constants';
import { AdminService } from '../admin/admin.service';
import { PublicModule } from '../public/public.module';
import { PublicService } from '../public/public.service';
import { CyclesModule } from './cycles.module';
import { CyclesService } from './cycles.service';
import { WeeklyCycleService } from './weekly-cycle.service';

const upcomingCycle = {
  id: 'cycle-12',
  codename: '第12周',
  status: 'OPEN',
  revealAt: new Date('2030-10-01T13:00:00Z'),
  participationDeadline: new Date('2030-10-01T11:00:00Z'),
};

function createServices() {
  const prisma = {
    user: { count: jest.fn().mockResolvedValue(100) },
    match: { count: jest.fn().mockResolvedValue(10) },
    $queryRaw: jest.fn().mockResolvedValue([{ count: 80 }]),
    matchCycle: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({ status: 'DRAFT' }),
      create: jest.fn().mockResolvedValue(upcomingCycle),
      update: jest.fn().mockResolvedValue(upcomingCycle),
    },
    $transaction: jest.fn(),
  };
  const publicService = new PublicService(prisma as never);
  const snapshots = {
    syncCycleSnapshots: jest.fn().mockResolvedValue(undefined),
  };
  const cycles = new CyclesService(
    prisma as never,
    snapshots as never,
    {} as never,
    publicService,
  );
  const audit = { write: jest.fn().mockResolvedValue(undefined) };
  const admin = new AdminService(
    prisma as never,
    cycles,
    audit as never,
    {} as never,
  );
  const weekly = new WeeklyCycleService(prisma as never, publicService);
  return { prisma, publicService, snapshots, cycles, audit, admin, weekly };
}

describe('public cycle cache invalidation', () => {
  it('imports the shared PublicService provider for cycle mutations', () => {
    const imports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      CyclesModule,
    );
    expect(imports).toContain(PublicModule);
  });

  it.each([false, true])(
    'refreshes the landing cycle immediately after admin save (existing: %s)',
    async (existing) => {
      const { prisma, publicService, admin } = createServices();
      expect((await publicService.getLandingPayload()).currentCycle).toBeNull();
      prisma.matchCycle.findFirst.mockResolvedValue(upcomingCycle);

      await admin.upsertCycle(
        {
          ...(existing ? { cycleId: upcomingCycle.id } : {}),
          codename: upcomingCycle.codename,
          status: 'OPEN',
          revealAt: upcomingCycle.revealAt.toISOString(),
          participationDeadline:
            upcomingCycle.participationDeadline.toISOString(),
        },
        'admin-1',
      );

      expect((await publicService.getLandingPayload()).currentCycle).toEqual({
        codename: upcomingCycle.codename,
        revealAt: upcomingCycle.revealAt,
        participationDeadline: upcomingCycle.participationDeadline,
      });
      expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(2);
    },
  );

  it('invalidates a committed admin update even when its audit write fails', async () => {
    const { prisma, publicService, audit, admin } = createServices();
    await publicService.getLandingPayload();
    prisma.matchCycle.findFirst.mockResolvedValue(upcomingCycle);
    audit.write.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      admin.upsertCycle(
        {
          cycleId: upcomingCycle.id,
          codename: upcomingCycle.codename,
          status: 'OPEN',
          revealAt: upcomingCycle.revealAt.toISOString(),
          participationDeadline:
            upcomingCycle.participationDeadline.toISOString(),
        },
        'admin-1',
      ),
    ).rejects.toThrow('audit unavailable');

    expect(
      (await publicService.getLandingPayload()).currentCycle,
    ).toMatchObject({
      codename: upcomingCycle.codename,
    });
  });

  it.each(['ensureUpcomingCycle', 'updateSettings'] as const)(
    'invalidates after %s commits an automatic cycle',
    async (method) => {
      const { prisma, publicService, weekly } = createServices();
      await publicService.getLandingPayload();
      const invalidate = jest.spyOn(publicService, 'invalidateLandingCache');
      const tx = {
        $executeRaw: jest.fn(),
        systemSetting: {
          findUnique: jest.fn().mockResolvedValue({
            value: JSON.stringify({ enabled: true, deadlineHours: 2 }),
          }),
          upsert: jest.fn(),
        },
        matchCycle: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ codename: '第11周' }]),
          create: jest.fn().mockResolvedValue(upcomingCycle),
        },
        auditLog: { create: jest.fn() },
      };
      prisma.$transaction.mockImplementation(
        async (callback: (client: unknown) => Promise<unknown>) => {
          const result = await callback(tx);
          expect(invalidate).not.toHaveBeenCalled();
          prisma.matchCycle.findFirst.mockResolvedValue(upcomingCycle);
          return result;
        },
      );

      if (method === 'ensureUpcomingCycle') {
        await weekly.ensureUpcomingCycle();
      } else {
        await weekly.updateSettings(
          { enabled: true, deadlineHours: 2 },
          'admin-1',
        );
      }

      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(
        (await publicService.getLandingPayload()).currentCycle,
      ).toMatchObject({
        codename: upcomingCycle.codename,
      });
    },
  );

  it('preserves the cached landing payload when automatic creation is a no-op or rolls back', async () => {
    const { prisma, publicService, weekly } = createServices();
    await publicService.getLandingPayload();
    const invalidate = jest.spyOn(publicService, 'invalidateLandingCache');
    prisma.$transaction.mockResolvedValueOnce(null);
    await weekly.ensureUpcomingCycle();
    prisma.$transaction.mockRejectedValueOnce(new Error('commit failed'));
    await expect(weekly.ensureUpcomingCycle()).rejects.toThrow('commit failed');

    expect(invalidate).not.toHaveBeenCalled();
    await publicService.getLandingPayload();
    expect(prisma.matchCycle.findFirst).toHaveBeenCalledTimes(1);
  });

  it('removes a revealed cycle after commit, before dashboard rebuilding', async () => {
    const { prisma, publicService, snapshots, cycles } = createServices();
    prisma.matchCycle.findFirst.mockResolvedValue(upcomingCycle);
    await publicService.getLandingPayload();
    prisma.matchCycle.findUnique.mockResolvedValue({
      ...upcomingCycle,
      status: 'REVEAL_READY',
      revealAt: new Date(0),
    });
    const invalidate = jest.spyOn(publicService, 'invalidateLandingCache');
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const result = await callback({
          matchCycle: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
          match: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          auditLog: { create: jest.fn() },
        });
        expect(invalidate).not.toHaveBeenCalled();
        prisma.matchCycle.findFirst.mockResolvedValue(null);
        return result;
      },
    );
    snapshots.syncCycleSnapshots.mockImplementation(async () => {
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect((await publicService.getLandingPayload()).currentCycle).toBeNull();
    });

    await expect(
      cycles.runRevealCycle({ cycleId: upcomingCycle.id }),
    ).resolves.toMatchObject({ state: 'REVEALED' });
  });

  it('invalidates a committed forced reset even if the subsequent rerun fails', async () => {
    const { prisma, publicService, cycles } = createServices();
    await publicService.getLandingPayload();
    prisma.matchCycle.findUnique
      .mockResolvedValueOnce({ ...upcomingCycle, status: 'REVEALED' })
      .mockResolvedValueOnce(null);
    const invalidate = jest.spyOn(publicService, 'invalidateLandingCache');
    prisma.$transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const result = await callback({
          $queryRaw: jest.fn().mockResolvedValue([]),
          match: { deleteMany: jest.fn() },
          userCycleDashboardSnapshot: { deleteMany: jest.fn() },
          matchCycle: { update: jest.fn() },
        });
        expect(invalidate).not.toHaveBeenCalled();
        prisma.matchCycle.findFirst.mockResolvedValue(upcomingCycle);
        return result;
      },
    );

    await expect(
      cycles.runRevealCycle({ cycleId: upcomingCycle.id, force: true }),
    ).rejects.toThrow('Cycle not found.');

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(
      (await publicService.getLandingPayload()).currentCycle,
    ).toMatchObject({
      codename: upcomingCycle.codename,
    });
  });
});
