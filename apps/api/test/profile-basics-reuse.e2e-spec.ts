import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { AccountService } from '../src/modules/account/account.service';
import { QuestionnaireService } from '../src/modules/questionnaire/questionnaire.service';

const migration = readFileSync(
  join(
    __dirname,
    '../prisma/migrations/20260921110000_reuse_archived_profile_basics/migration.sql',
  ),
  'utf8',
);
const update = migration
  .slice(
    migration.indexOf('WITH historical_profile'),
    migration.lastIndexOf('COMMIT;'),
  )
  .trim();

describe('Archived profile basics reuse (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reuses only profile basics on untouched reset rows and preserves all newer edits', async () => {
    const rollback = new Error('rollback profile reuse fixtures');
    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.questionnaireVersion.updateMany({
            data: { isCurrent: false },
          });
          const version = await tx.questionnaireVersion.create({
            data: { title: 'Profile reuse', isCurrent: true },
          });
          const old = await tx.questionnaireVersion.create({
            data: { title: 'Archived profile' },
          });
          const school = await tx.school.create({
            data: { name: 'Profile fixture school', slug: randomUUID() },
          });
          const resetAt = new Date('2026-09-20T12:00:00.000Z');
          async function fixture() {
            const user = await tx.user.create({
              data: {
                email: `${randomUUID()}@example.test`,
                passwordHash: 'unused',
                status: 'ACTIVE',
                displayName: '保留昵称',
                schoolId: school.id,
                preferredContactChannel: 'WECHAT',
                contactMethods: {
                  create: { type: 'WECHAT', value: 'synthetic_contact' },
                },
              },
              include: { contactMethods: true },
            });
            const response = await tx.questionnaireResponse.create({
              data: {
                userId: user.id,
                versionId: version.id,
                answers: {},
                updatedAt: resetAt,
              },
            });
            const archive = await tx.questionnaireResponseArchive.create({
              data: {
                id: randomUUID(),
                releaseId: 'autumn-reset-2026-09-20',
                sourceResponseId: response.id,
                userId: user.id,
                versionId: old.id,
                archivedAt: resetAt,
                sourceUpdatedAt: resetAt,
                submittedAt: resetAt,
                answers: {
                  hard_gender: '女',
                  hard_one_liner_intro: '喜欢散步和读书。',
                  hard_birth_date: '2000-01-01',
                  hard_partner_genders: ['男'],
                  retired_question: 'old',
                },
              },
            });
            return { user, response, archive };
          }
          const untouched = await fixture();
          const draft = await fixture();
          const edited = await fixture();
          const cleared = await fixture();
          const submitted = await fixture();
          const deactivated = await fixture();
          const previousVersion = await fixture();
          const oldDraft = await fixture();
          const invalid = await fixture();
          const clearedOldDraft = await fixture();
          await tx.questionnaireResponse.update({
            where: { id: draft.response.id },
            data: {
              draftAnswers: {
                displayName: '新版昵称',
                hardMatchForm: { gender: '', oneLinerIntro: '' },
              },
            },
          });
          await tx.questionnaireResponse.update({
            where: { id: edited.response.id },
            data: {
              answers: { hard_gender: '男', hard_one_liner_intro: '新版介绍' },
            },
          });
          await tx.questionnaireResponse.update({
            where: { id: cleared.response.id },
            data: { answers: {}, updatedAt: new Date(resetAt.getTime() + 1) },
          });
          await tx.questionnaireResponse.update({
            where: { id: submitted.response.id },
            data: { submittedAt: new Date() },
          });
          await tx.user.update({
            where: { id: deactivated.user.id },
            data: { deactivatedAt: new Date() },
          });
          await tx.questionnaireResponse.update({
            where: { id: previousVersion.response.id },
            data: { versionId: old.id, updatedAt: resetAt },
          });
          await tx.questionnaireResponseArchive.update({
            where: { id: oldDraft.archive.id },
            data: {
              draftAnswers: {
                displayName: '过期草稿昵称',
                hardMatchForm: {
                  gender: '非二元',
                  oneLinerIntro: '归档草稿介绍',
                  heightCm: '180',
                },
              },
            },
          });
          await tx.questionnaireResponseArchive.update({
            where: { id: invalid.archive.id },
            data: {
              answers: {
                hard_gender: 'invalid',
                hard_one_liner_intro: 'x'.repeat(201),
              },
            },
          });
          await tx.questionnaireResponseArchive.update({
            where: { id: clearedOldDraft.archive.id },
            data: {
              draftAnswers: {
                hardMatchForm: { gender: '', oneLinerIntro: '' },
              },
            },
          });
          const protectedIds = [
            draft,
            edited,
            cleared,
            submitted,
            deactivated,
            previousVersion,
            invalid,
            clearedOldDraft,
          ].map((f) => f.response.id);
          const protectedBefore = await tx.questionnaireResponse.findMany({
            where: { id: { in: protectedIds } },
            orderBy: { id: 'asc' },
          });
          const archivesBefore = await tx.questionnaireResponseArchive.findMany(
            { orderBy: { id: 'asc' } },
          );

          expect(await tx.$executeRawUnsafe(update)).toBe(2);
          const read = await tx.questionnaireResponse.findUniqueOrThrow({
            where: { id: untouched.response.id },
          });
          expect(read).toMatchObject({
            answers: {
              hard_gender: '女',
              hard_one_liner_intro: '喜欢散步和读书。',
            },
            draftAnswers: null,
            submittedAt: null,
            acknowledgedQuestionnaireVersionId: null,
            acknowledgedQuestionnaireKeys: null,
            acknowledgedHardMatchSignatures: null,
          });
          expect(
            (
              await tx.questionnaireResponse.findUniqueOrThrow({
                where: { id: oldDraft.response.id },
              })
            ).answers,
          ).toEqual({
            hard_gender: '非二元',
            hard_one_liner_intro: '归档草稿介绍',
          });
          expect(
            await tx.questionnaireResponse.findMany({
              where: { id: { in: protectedIds } },
              orderBy: { id: 'asc' },
            }),
          ).toEqual(protectedBefore);
          expect(
            await tx.questionnaireResponseArchive.findMany({
              orderBy: { id: 'asc' },
            }),
          ).toEqual(archivesBefore);
          expect(
            await tx.user.findUnique({
              where: { id: untouched.user.id },
              include: { contactMethods: true },
            }),
          ).toEqual(untouched.user);
          expect(await tx.$executeRawUnsafe(update)).toBe(0);

          const account = new AccountService(
            tx as never,
            new QuestionnaireService(tx as never),
            {} as never,
          );
          const payload = await account.getQuestionnaire(untouched.user.id);
          expect(payload).toMatchObject({
            submittedAt: null,
            draft: null,
            answers: {
              hard_gender: '女',
              hard_one_liner_intro: '喜欢散步和读书。',
            },
          });
          expect(
            await account.saveQuestionnaire(untouched.user.id, {
              versionId: version.id,
              displayName: '保留昵称',
              answers: {},
              hardMatchForm: { gender: '女', oneLinerIntro: '编辑后的介绍' },
            }),
          ).toMatchObject({
            saveState: 'DRAFT',
            questionnaireSubmittedAt: null,
          });
          expect(await tx.$executeRawUnsafe(update)).toBe(0);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toThrow(rollback);
  });
});
