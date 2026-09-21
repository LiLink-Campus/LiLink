import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PublicService } from '../src/modules/public/public.service';
import { CommunityStatsService } from '../src/modules/public/community-stats.service';

describe('Public lifetime questionnaire statistics (PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('uses submitted archives once per user, prefers new submissions, and lists empty eligible schools', async () => {
    const rollback = new Error('rollback public statistics fixtures');
    await expect(
      prisma.$transaction(
        async (tx) => {
          const before = await new CommunityStatsService(
            tx as never,
          ).getStats();
          const landingBefore = await new PublicService(
            tx as never,
          ).getLandingPayload();
          const version = await tx.questionnaireVersion.create({
            data: { title: 'Public statistics fixture' },
          });
          const school = await tx.school.create({
            data: { name: 'Statistics populated school', slug: randomUUID() },
          });
          const emptySchool = await tx.school.create({
            data: { name: 'Statistics empty school', slug: randomUUID() },
          });
          const hiddenSchool = await tx.school.create({
            data: {
              name: 'Statistics hidden school',
              slug: randomUUID(),
              registrationEligible: false,
            },
          });
          async function user(
            overrides: {
              status?: 'PENDING' | 'SUSPENDED';
              isTest?: boolean;
              deactivatedAt?: Date;
            } = {},
          ) {
            return tx.user.create({
              data: {
                email: `${randomUUID()}@example.test`,
                passwordHash: 'fixture',
                schoolId: school.id,
                status: 'ACTIVE',
                ...overrides,
              },
            });
          }
          async function archive(
            userId: string,
            gender: string,
            submittedAt: Date | null,
          ) {
            return tx.questionnaireResponseArchive.create({
              data: {
                id: randomUUID(),
                releaseId: randomUUID(),
                sourceResponseId: randomUUID(),
                userId,
                versionId: version.id,
                answers: { hard_gender: gender },
                submittedAt,
                sourceUpdatedAt: new Date(),
              },
            });
          }
          const older = new Date('2025-01-01T00:00:00Z');
          const newer = new Date('2026-01-01T00:00:00Z');
          const historical = await user();
          await archive(historical.id, '男', older);
          await archive(historical.id, ' 女 ', newer);
          await archive(historical.id, '非二元', null);
          await tx.questionnaireResponse.create({
            data: {
              userId: historical.id,
              versionId: version.id,
              answers: { hard_school: school.id },
              draftAnswers: { hard_gender: '男' },
            },
          });
          const resubmitted = await user();
          await archive(resubmitted.id, '女', older);
          await tx.questionnaireResponse.create({
            data: {
              userId: resubmitted.id,
              versionId: version.id,
              answers: { hard_gender: '非二元' },
              submittedAt: newer,
            },
          });
          const currentOnly = await user();
          await tx.questionnaireResponse.create({
            data: {
              userId: currentOnly.id,
              versionId: version.id,
              answers: { hard_gender: '男' },
              submittedAt: newer,
            },
          });
          const draftOnly = await user();
          await archive(draftOnly.id, '男', null);
          const invalid = await user();
          await archive(invalid.id, 'invalid', older);
          await user();
          for (const overrides of [
            { status: 'PENDING' as const },
            { status: 'SUSPENDED' as const },
            { isTest: true },
            { deactivatedAt: newer },
          ]) {
            const excluded = await user(overrides);
            await archive(excluded.id, '男', older);
          }

          const stats = await new CommunityStatsService(tx as never).getStats();
          const landing = await new PublicService(
            tx as never,
          ).getLandingPayload();
          expect(stats.total - before.total).toBe(6);
          expect(stats.genders).toEqual({
            male: before.genders.male + 1,
            female: before.genders.female + 1,
            nonBinary: before.genders.nonBinary + 1,
            unknown: before.genders.unknown + 3,
          });
          expect(
            landing.stats.registeredUsers - landingBefore.stats.registeredUsers,
          ).toBe(6);
          expect(
            landing.stats.completedQuestionnaires -
              landingBefore.stats.completedQuestionnaires,
          ).toBe(3);
          expect(stats.schools).toContainEqual({
            id: school.id,
            name: school.name,
            count: 6,
          });
          expect(stats.schools).toContainEqual({
            id: emptySchool.id,
            name: emptySchool.name,
            count: 0,
          });
          expect(
            stats.schools.some((entry) => entry.id === hiddenSchool.id),
          ).toBe(false);
          const active = await tx.questionnaireResponse.findUniqueOrThrow({
            where: { userId: historical.id },
          });
          expect(active.submittedAt).toBeNull();
          expect(active.answers).toEqual({ hard_school: school.id });
          expect(active.draftAnswers).toEqual({ hard_gender: '男' });
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
