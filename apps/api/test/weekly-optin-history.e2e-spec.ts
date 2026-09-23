import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { AdminAnalyticsService } from '../src/modules/admin-analytics/admin-analytics.service';

type RetentionScenario = {
  name: string;
  scheduledReveal?: string;
  revealEvents?: string[];
  status?: 'REVEALED' | 'OPEN';
  currentSubmitted?: boolean;
  archives?: Array<{
    gender: string;
    submittedAt: string | null;
    archivedAt: string;
  }>;
  expectedGender: 'male' | 'female' | 'nonBinary' | 'unknown';
};

const retainedArchives = [
  { gender: '女', submittedAt: '2090-01-05', archivedAt: '2090-01-06' },
  { gender: '非二元', submittedAt: '2090-01-08', archivedAt: '2090-01-09' },
];

const retentionScenarios: RetentionScenario[] = [
  {
    name: 'uses the first retained archive even when its submission is after reveal',
    expectedGender: 'female',
  },
  {
    name: 'keeps invalid gender in the first archive unknown instead of using later data',
    archives: [
      { ...retainedArchives[0], gender: 'invalid' },
      retainedArchives[1],
    ],
    expectedGender: 'unknown',
  },
  {
    name: 'does not reuse a pre-reveal archive when the current questionnaire is blank',
    archives: [
      { gender: '女', submittedAt: '2090-01-01', archivedAt: '2090-01-02' },
    ],
    currentSubmitted: false,
    expectedGender: 'unknown',
  },
  {
    name: 'falls back to the current submission when no post-reveal archive exists',
    archives: [
      { gender: '女', submittedAt: '2090-01-01', archivedAt: '2090-01-02' },
    ],
    expectedGender: 'male',
  },
  {
    name: 'uses only the current submission for an unrevealed cycle',
    status: 'OPEN',
    expectedGender: 'male',
  },
  {
    name: 'ignores archived drafts and retains the first submitted archive',
    archives: [
      { gender: '男', submittedAt: null, archivedAt: '2090-01-04' },
      ...retainedArchives,
    ],
    currentSubmitted: false,
    expectedGender: 'female',
  },
  {
    name: 'finds archives between an early forced reveal and the planned date',
    scheduledReveal: '2090-01-10',
    revealEvents: ['2090-01-03'],
    expectedGender: 'female',
  },
  {
    name: 'uses the actual reveal after the scheduled date was edited',
    scheduledReveal: '2090-01-01',
    revealEvents: ['2090-01-07'],
    expectedGender: 'nonBinary',
  },
  {
    name: 'uses the latest reveal event after a forced rerun',
    revealEvents: ['2090-01-03', '2090-01-07'],
    expectedGender: 'nonBinary',
  },
  {
    name: 'includes an archive at the actual reveal boundary',
    revealEvents: ['2090-01-06'],
    expectedGender: 'female',
  },
];

describe('Weekly opt-in questionnaire history (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });
  afterAll(async () => prisma.$disconnect());

  it.each(retentionScenarios)('$name', async (scenario) => {
    const rollback = new Error('rollback actual reveal fixtures');
    await expect(
      prisma.$transaction(async (tx) => {
        const version = await tx.questionnaireVersion.create({
          data: { title: 'Actual reveal history fixture' },
        });
        const cycle = await tx.matchCycle.create({
          data: {
            codename: randomUUID(),
            status: scenario.status ?? 'REVEALED',
            participationDeadline: new Date('2089-12-31'),
            revealAt: new Date(scenario.scheduledReveal ?? '2090-01-03'),
          },
        });
        const user = await tx.user.create({
          data: {
            email: `${randomUUID()}@example.test`,
            passwordHash: 'fixture',
            status: 'ACTIVE',
            participations: {
              create: { cycleId: cycle.id, status: 'OPTED_IN', intent: 'BOTH' },
            },
            questionnaireResponse: {
              create: {
                versionId: version.id,
                answers: { hard_gender: '男' },
                submittedAt:
                  scenario.currentSubmitted === false
                    ? null
                    : new Date('2090-01-10'),
              },
            },
          },
        });
        await tx.questionnaireResponseArchive.createMany({
          data: (scenario.archives ?? retainedArchives).map(
            ({ gender, submittedAt, archivedAt }) => ({
              id: randomUUID(),
              releaseId: randomUUID(),
              sourceResponseId: randomUUID(),
              userId: user.id,
              versionId: version.id,
              answers: { hard_gender: gender },
              submittedAt: submittedAt ? new Date(submittedAt) : null,
              sourceUpdatedAt: new Date(submittedAt ?? archivedAt),
              archivedAt: new Date(archivedAt),
            }),
          ),
        });
        await tx.auditLog.createMany({
          data: [
            ...(scenario.revealEvents ?? []).map((createdAt) => ({
              action: 'cycle.revealed',
              metadata: { cycleId: cycle.id },
              createdAt: new Date(createdAt),
            })),
            {
              action: 'cycle.updated',
              metadata: { cycleId: cycle.id },
              createdAt: new Date('2090-01-09'),
            },
            {
              action: 'cycle.revealed',
              metadata: { cycleId: randomUUID() },
              createdAt: new Date('2090-01-09'),
            },
          ],
        });
        const result = await new AdminAnalyticsService(tx as never).weeklyOptin(
          {
            limit: 1,
          },
        );
        expect(
          result.cycles.find((row) => row.cycleId === cycle.id),
        ).toMatchObject({
          optedIn: {
            total: 1,
            male: scenario.expectedGender === 'male' ? 1 : 0,
            female: scenario.expectedGender === 'female' ? 1 : 0,
            nonBinary: scenario.expectedGender === 'nonBinary' ? 1 : 0,
            unknown: scenario.expectedGender === 'unknown' ? 1 : 0,
          },
        });
        throw rollback;
      }),
    ).rejects.toThrow(rollback);
  });

  it('counts each signup once, restores retained archives only for revealed rounds, and preserves account filters', async () => {
    const rollback = new Error('rollback weekly history fixtures');
    await expect(
      prisma.$transaction(
        async (tx) => {
          const version = await tx.questionnaireVersion.create({
            data: { title: 'Weekly history fixture' },
          });
          const revealed = await tx.matchCycle.create({
            data: {
              codename: randomUUID(),
              status: 'REVEALED',
              participationDeadline: new Date('2090-01-02'),
              revealAt: new Date('2090-01-03'),
            },
          });
          const open = await tx.matchCycle.create({
            data: {
              codename: randomUUID(),
              status: 'OPEN',
              participationDeadline: new Date('2090-02-02'),
              revealAt: new Date('2090-02-03'),
            },
          });
          async function participant(
            overrides: {
              isTest?: boolean;
              status?: 'SUSPENDED';
              deactivatedAt?: Date;
            } = {},
          ) {
            return tx.user.create({
              data: {
                email: `${randomUUID()}@example.test`,
                passwordHash: 'fixture',
                status: 'ACTIVE',
                ...overrides,
                participations: {
                  create: [revealed, open].map((cycle) => ({
                    cycleId: cycle.id,
                    status: 'OPTED_IN',
                    intent: 'BOTH',
                  })),
                },
              },
            });
          }
          async function archive(
            userId: string,
            gender: string,
            submittedAt: Date | null,
            archivedAt = new Date('2090-01-04'),
          ) {
            await tx.questionnaireResponseArchive.create({
              data: {
                id: randomUUID(),
                releaseId: randomUUID(),
                sourceResponseId: randomUUID(),
                userId,
                versionId: version.id,
                answers: { hard_gender: gender },
                submittedAt,
                sourceUpdatedAt: submittedAt ?? new Date('2090-01-01'),
                archivedAt,
              },
            });
          }
          const older = new Date('2089-12-01');
          const before = new Date('2090-01-01');
          const after = new Date('2090-01-04');
          const historical = await participant();
          await archive(historical.id, '男', older, before);
          await archive(historical.id, ' 女 ', before);
          await archive(historical.id, '非二元', null);
          await tx.questionnaireResponse.create({
            data: {
              userId: historical.id,
              versionId: version.id,
              answers: {},
              draftAnswers: { hard_gender: '男' },
            },
          });
          const resubmitted = await participant();
          await archive(resubmitted.id, '女', before);
          await archive(resubmitted.id, '男', after, new Date('2090-01-05'));
          await tx.questionnaireResponse.create({
            data: {
              userId: resubmitted.id,
              versionId: version.id,
              answers: { hard_gender: '非二元' },
              submittedAt: after,
            },
          });
          const current = await participant();
          await tx.questionnaireResponse.create({
            data: {
              userId: current.id,
              versionId: version.id,
              answers: { hard_gender: '男' },
              submittedAt: before,
            },
          });
          const draft = await participant();
          await archive(draft.id, '男', null);
          const invalid = await participant();
          await archive(invalid.id, 'invalid', before);
          const future = await participant();
          await archive(future.id, '女', after);
          const testUser = await participant({ isTest: true });
          await archive(testUser.id, '男', before);
          for (const overrides of [
            { status: 'SUSPENDED' as const },
            { deactivatedAt: before },
          ]) {
            await archive((await participant(overrides)).id, '男', before);
          }
          for (const change of [
            { status: 'OPTED_OUT' as const },
            { intent: null },
          ]) {
            const excluded = await participant();
            await archive(excluded.id, '男', before);
            await tx.cycleParticipation.updateMany({
              where: { userId: excluded.id },
              data: change,
            });
          }
          const service = new AdminAnalyticsService(tx as never);
          const result = await service.weeklyOptin({ limit: 2 });
          expect(
            result.cycles.find((c) => c.cycleId === revealed.id),
          ).toMatchObject({
            optedIn: { total: 6, male: 1, female: 3, nonBinary: 0, unknown: 2 },
            femaleShare: 3 / 4,
          });
          expect(
            result.cycles.find((c) => c.cycleId === open.id),
          ).toMatchObject({
            optedIn: { total: 6, male: 1, female: 0, nonBinary: 1, unknown: 4 },
            femaleShare: 0,
          });
          const withTests = await service.weeklyOptin({
            limit: 2,
            includeTest: true,
          });
          expect(
            withTests.cycles.find((c) => c.cycleId === revealed.id)?.optedIn,
          ).toEqual({
            total: 7,
            male: 2,
            female: 3,
            nonBinary: 0,
            unknown: 2,
          });
          expect(
            (
              await tx.questionnaireResponse.findUniqueOrThrow({
                where: { userId: historical.id },
              })
            ).submittedAt,
          ).toBeNull();
          expect(
            await tx.questionnaireResponseArchive.count({
              where: { userId: historical.id },
            }),
          ).toBe(3);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toThrow(rollback);
  });
});
