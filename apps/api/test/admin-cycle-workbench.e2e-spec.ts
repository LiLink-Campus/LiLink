import { randomUUID } from 'crypto';
import { HARD_MATCH_KEYS } from '@lilink/shared';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AdminAnalyticsService } from '../src/modules/admin-analytics/admin-analytics.service';
import { AdminAuditService } from '../src/modules/admin/admin-audit.service';
import { AdminService } from '../src/modules/admin/admin.service';

const tag = `cycle-workbench-${randomUUID()}`;
describe('Cycle workbench scope and audit (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let analytics: AdminAnalyticsService;
  let audit: AdminAuditService;
  let cycleId: string;
  let otherId: string;
  let versionId: string;
  let adminId: string;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    analytics = new AdminAnalyticsService(prisma as PrismaService);
    audit = new AdminAuditService(prisma as PrismaService);
    const cycles = await Promise.all(
      ['one', 'two'].map((suffix) =>
        prisma.matchCycle.create({
          data: {
            codename: `${tag}-${suffix}`,
            status: 'OPEN',
            participationDeadline: new Date('2035-01-01'),
            revealAt: new Date('2035-01-02'),
          },
        }),
      ),
    );
    [cycleId, otherId] = cycles.map((cycle) => cycle.id);
    versionId = (
      await prisma.questionnaireVersion.create({ data: { title: tag } })
    ).id;
    adminId = (
      await prisma.adminOperator.create({
        data: {
          email: `${tag}@example.test`,
          passwordHash: 'unused-test-hash',
        },
      })
    ).id;
    for (const kind of [
      'submitted',
      'draft',
      'test',
      'other',
      'out',
      'no-intent',
      'suspended',
      'deactivated',
    ]) {
      await prisma.user.create({
        data: {
          email: `${kind}-${tag}@example.test`,
          passwordHash: 'unused-test-hash',
          status: kind === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          isTest: kind === 'test',
          deactivatedAt: kind === 'deactivated' ? new Date() : null,
          participations: {
            create: {
              cycleId: kind === 'other' ? otherId : cycleId,
              status: kind === 'out' ? 'OPTED_OUT' : 'OPTED_IN',
              intent: kind === 'no-intent' ? null : 'BOTH',
            },
          },
          questionnaireResponse: {
            create: {
              versionId,
              answers: {
                [HARD_MATCH_KEYS.gender]: kind === 'test' ? '女' : '男',
              },
              submittedAt: kind === 'draft' ? null : new Date(),
            },
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { metadata: { path: ['cycleId'], equals: cycleId } },
    });
    await prisma.auditLog.deleteMany({
      where: { metadata: { path: ['cycleId'], equals: otherId } },
    });
    await prisma.adminOperator.deleteMany({ where: { id: adminId } });
    await prisma.matchCycle.deleteMany({
      where: { id: { in: [cycleId, otherId] } },
    });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `${tag}@example.test` } },
    });
    await prisma.questionnaireVersion.deleteMany({ where: { id: versionId } });
    await prisma.$disconnect();
  });

  it('counts only active opted-in accounts with intent in the selected cycle, and submitted questionnaires', async () => {
    const result = await analytics.schoolsGender({
      cycleId,
      includeTest: true,
    });
    expect(result.totals).toEqual({
      total: 3,
      submitted: 2,
      male: 1,
      female: 1,
      nonBinary: 0,
      unknown: 1,
    });
    expect((await analytics.schoolsGender({ cycleId })).totals).toMatchObject({
      total: 2,
      submitted: 1,
      female: 0,
    });
    expect(
      (await analytics.schoolsGender({ cycleId: otherId, includeTest: true }))
        .totals,
    ).toMatchObject({ total: 1, submitted: 1 });
  });

  it('uses the same eligible-account scope for the weekly chart', async () => {
    const result = await analytics.weeklyOptin({ includeTest: true, limit: 8 });
    expect(
      result.cycles.find((cycle) => cycle.cycleId === cycleId)?.optedIn,
    ).toEqual({ total: 3, male: 1, female: 1, nonBinary: 0, unknown: 1 });
  });

  it('records the preview actor and timestamp and filters both searched and unsearched audit pages', async () => {
    const admin = new AdminService(
      prisma as PrismaService,
      {
        previewCycle: () =>
          Promise.resolve({
            cycleId,
            candidates: [],
            suggestedPairs: [],
            unmatchedUserIds: [],
          }),
      } as never,
      audit,
      {} as never,
    );
    const preview = await admin.previewCycle(cycleId, adminId);
    expect(Number.isNaN(Date.parse(preview.generatedAt))).toBe(false);
    await prisma.auditLog.createMany({
      data: [
        { action: 'cycle.prepared', metadata: { cycleId } },
        { action: 'cycle.previewed', metadata: { cycleId: otherId } },
      ],
    });
    const all = await audit.listAuditLogs({ cycleId, page: 1 });
    expect(Array.isArray(all)).toBe(false);
    if (Array.isArray(all))
      throw new Error('Expected a paginated audit response');
    expect(all.total).toBe(2);
    const row = all.items.find((entry) => entry.action === 'cycle.previewed');
    expect(row?.actor?.email).toBe(`${tag}@example.test`);
    expect(row?.metadata).toMatchObject({
      cycleId,
      generatedAt: preview.generatedAt,
      suggestedPairs: 0,
    });
    const searched = await audit.listAuditLogs({
      cycleId,
      search: 'cycle.',
      action: 'cycle.previewed',
      page: 1,
    });
    if (Array.isArray(searched))
      throw new Error('Expected a paginated audit response');
    expect(searched.total).toBe(1);
    expect(searched.items[0].id).toBe(row?.id);
  });
});
