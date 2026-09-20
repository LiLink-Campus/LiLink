import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LIFESTYLE_QUESTIONS } from '@lilink/shared';
import {
  createPrismaClient,
  Prisma,
  PrismaClient,
} from '../src/common/prisma/client';
import { queueMatchRevealEmails } from '../src/common/mail/queue-match-reveal';
import { MailService } from '../src/common/mail/mail.service';

const enrollmentMigration = '20260920100000_require_fresh_cycle_opt_in';
const readMigration = (name: string) =>
  readFileSync(
    join(__dirname, '../prisma/migrations', name, 'migration.sql'),
    'utf8',
  );

describe('Autumn upgrade safety (PostgreSQL)', () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  async function rollbackTest(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const rollback = new Error('rollback autumn fixtures');
    await expect(
      prisma.$transaction(
        async (tx) => {
          await run(tx);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toThrow(rollback);
  }

  it('archives exact submitted and draft values before clearing active answers and freezes history', async () => {
    await rollbackTest(async (tx) => {
      await tx.questionnaireVersion.updateMany({ data: { isCurrent: false } });
      const version = await tx.questionnaireVersion.create({
        data: {
          title: 'Reset fixture',
          isCurrent: true,
          questions: {
            create: {
              key: 'custom',
              prompt: 'Custom',
              type: 'SINGLE_SELECT',
              order: 1,
              weight: 0,
              required: false,
            },
          },
        },
      });
      const user = await tx.user.create({
        data: {
          email: `${randomUUID()}@example.test`,
          passwordHash: 'preserved-hash',
          displayName: 'Preserved name',
          status: 'ACTIVE',
          profile: { create: { headline: 'Fallback headline' } },
        },
      });
      const response = await tx.questionnaireResponse.create({
        data: {
          userId: user.id,
          versionId: version.id,
          answers: {
            retired_key: ['old', null],
            hard_one_liner_intro: ' Original intro ',
            hard_gender: '女',
            hard_partner_genders: ['男'],
          },
          draftAnswers: { retired_key: null, nested: { untouched: true } },
          acknowledgedQuestionnaireVersionId: version.id,
          acknowledgedQuestionnaireKeys: ['retired_key'],
          acknowledgedHardMatchSignatures: { opaque: 'exact' },
          submittedAt: new Date(),
        },
      });
      const cycle = await tx.matchCycle.create({
        data: {
          codename: randomUUID(),
          status: 'REVEALED',
          participationDeadline: new Date(),
          revealAt: new Date(),
        },
      });
      const match = await tx.match.create({
        data: {
          cycleId: cycle.id,
          score: 85,
          participants: {
            create: { cycleId: cycle.id, userId: user.id, position: 0 },
          },
        },
      });
      const sql = readMigration(
        '20260920200000_archive_and_reset_questionnaires',
      );
      await tx.$executeRawUnsafe(
        sql.slice(sql.indexOf('DO $$'), sql.lastIndexOf('COMMIT;')),
      );
      const archive = await tx.questionnaireResponseArchive.findUniqueOrThrow({
        where: {
          releaseId_sourceResponseId: {
            releaseId: 'autumn-reset-2026-09-20',
            sourceResponseId: response.id,
          },
        },
      });
      for (const key of [
        'userId',
        'versionId',
        'answers',
        'draftAnswers',
        'acknowledgedQuestionnaireVersionId',
        'acknowledgedQuestionnaireKeys',
        'acknowledgedHardMatchSignatures',
        'submittedAt',
      ] as const)
        expect(archive[key]).toEqual(response[key]);
      expect(archive.sourceUpdatedAt).toEqual(response.updatedAt);
      const active = await tx.questionnaireResponse.findUniqueOrThrow({
        where: { id: response.id },
      });
      expect(active.versionId).not.toBe(version.id);
      expect(active).toMatchObject({
        answers: {},
        draftAnswers: null,
        submittedAt: null,
        acknowledgedQuestionnaireVersionId: null,
        acknowledgedQuestionnaireKeys: null,
        acknowledgedHardMatchSignatures: null,
      });
      await tx.questionnaireResponse.update({
        where: { id: response.id },
        data: {
          answers: { hard_one_liner_intro: 'New intro', hard_gender: '男' },
          draftAnswers: { new: true },
        },
      });
      const participant = await tx.matchParticipant.findFirstOrThrow({
        where: { matchId: match.id },
      });
      expect(participant.profileSnapshot).toMatchObject({
        introLine: 'Original intro',
        gender: '女',
        partnerGenders: ['男'],
        archiveId: archive.id,
        source: 'pre-reset-visible-profile',
      });
      expect(
        await tx.questionnaireResponseArchive.findUnique({
          where: { id: archive.id },
        }),
      ).toEqual(archive);
      expect(
        await tx.user.findUnique({ where: { id: user.id } }),
      ).toMatchObject({
        passwordHash: 'preserved-hash',
        displayName: 'Preserved name',
        status: 'ACTIVE',
      });
      expect(
        await tx.question.count({ where: { versionId: version.id } }),
      ).toBe(1);
      expect(
        await tx.question.count({ where: { versionId: active.versionId } }),
      ).toBe(1);
    });
  });

  it('retires legacy active enrollments and prevents prepared matches from disclosing contacts', async () => {
    await rollbackTest(async (tx) => {
      const [row] = await tx.$queryRaw<
        { cutoff: Date }[]
      >`SELECT "started_at" AT TIME ZONE 'UTC' AS cutoff FROM "_prisma_migrations" WHERE "migration_name" = ${enrollmentMigration} AND "rolled_back_at" IS NULL`;
      const old = new Date(row.cutoff.getTime() - 60_000);
      const tag = randomUUID();
      const users = await Promise.all(
        ['a', 'b'].map((suffix) =>
          tx.user.create({
            data: {
              email: `${tag}-${suffix}@example.test`,
              passwordHash: 'unused',
              status: 'ACTIVE',
            },
          }),
        ),
      );
      const cycles = [];
      for (const status of [
        'OPEN',
        'PREPARING',
        'REVEAL_READY',
        'REVEALED',
      ] as const) {
        cycles.push(
          await tx.matchCycle.create({
            data: {
              codename: `${tag}-${status}`,
              status,
              participationDeadline: new Date(Date.now() + 60_000),
              revealAt: new Date(),
              participations: {
                create: users.map((user) => ({
                  userId: user.id,
                  status: 'OPTED_IN',
                  intent: 'BOTH',
                  optedInAt: old,
                  updatedAt: old,
                })),
              },
            },
          }),
        );
      }
      const ready = cycles[2];
      const revealedAt = new Date();
      const match = await tx.match.create({
        data: {
          cycleId: ready.id,
          score: 88,
          revealedAt,
          participants: {
            create: users.map((user, position) => ({
              userId: user.id,
              cycleId: ready.id,
              position,
            })),
          },
        },
      });
      await tx.$executeRawUnsafe(readMigration(enrollmentMigration));
      for (const cycle of cycles) {
        const rows = await tx.cycleParticipation.findMany({
          where: { cycleId: cycle.id },
        });
        expect(
          rows.every(
            (cp) =>
              cp.status ===
              (cycle.status === 'REVEALED' ? 'OPTED_IN' : 'OPTED_OUT'),
          ),
        ).toBe(true);
      }
      const buildMatchRevealEmails = jest.fn();
      const emails = await queueMatchRevealEmails(tx, ready.id, revealedAt, {
        buildMatchRevealEmails,
      } as unknown as MailService);
      expect(emails).toEqual([]);
      expect(buildMatchRevealEmails).not.toHaveBeenCalled();
      expect(
        (await tx.match.findUniqueOrThrow({ where: { id: match.id } }))
          .introducedAt,
      ).toBeNull();
      // Explicit confirmation after the migration boundary survives a rerun.
      await tx.cycleParticipation.updateMany({
        where: { cycleId: cycles[0].id },
        data: {
          status: 'OPTED_IN',
          intent: 'FRIEND',
          optedInAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await tx.$executeRawUnsafe(readMigration(enrollmentMigration));
      expect(
        await tx.cycleParticipation.count({
          where: { cycleId: cycles[0].id, status: 'OPTED_IN' },
        }),
      ).toBe(2);
    });
  });

  it.each([false, true])(
    'clones custom questions, adds only missing traits and preserves responses (partial=%s)',
    async (partial) => {
      await rollbackTest(async (tx) => {
        await tx.questionnaireVersion.updateMany({
          data: { isCurrent: false },
        });
        const old = await tx.questionnaireVersion.create({
          data: {
            title: 'Custom questionnaire',
            description: 'Preserve this',
            isCurrent: true,
            questions: {
              create: [
                {
                  key: 'custom',
                  prompt: 'Custom prompt',
                  description: 'Custom help',
                  type: 'MULTI_SELECT',
                  weight: 7,
                  order: 42,
                  required: false,
                  selectionLimit: 2,
                  options: [{ value: 'a', label: 'A' }],
                },
                ...(partial
                  ? [
                      {
                        key: 'smoking_status',
                        prompt: 'Existing smoking prompt',
                        type: 'SINGLE_SELECT' as const,
                        weight: 3,
                        order: 50,
                        required: false,
                        options: [{ value: '不吸烟', label: 'Custom label' }],
                      },
                    ]
                  : []),
              ],
            },
          },
          include: { questions: true },
        });
        const user = await tx.user.create({
          data: {
            email: `${randomUUID()}@example.test`,
            passwordHash: 'unused',
          },
        });
        const response = await tx.questionnaireResponse.create({
          data: {
            userId: user.id,
            versionId: old.id,
            answers: { custom: ['a'] },
            submittedAt: new Date(),
          },
        });
        const sql = readMigration(
          '20260920101000_add_lifestyle_questionnaire_revision',
        );
        await tx.$executeRawUnsafe(sql);
        const current = await tx.questionnaireVersion.findFirstOrThrow({
          where: { isCurrent: true },
          include: { questions: true },
        });
        expect(current.id).not.toBe(old.id);
        expect(current.title).toBe(old.title);
        for (const question of old.questions) {
          const copy = current.questions.find((q) => q.key === question.key);
          expect(copy).toBeDefined();
          expect({ ...copy, id: question.id, versionId: old.id }).toEqual(
            question,
          );
        }
        for (const question of LIFESTYLE_QUESTIONS) {
          const actual = current.questions.find((q) => q.key === question.key);
          expect(actual).toBeDefined();
          if (!partial || question.key !== 'smoking_status')
            expect(actual).toMatchObject({
              prompt: question.prompt,
              weight: 0,
              required: true,
              options: question.options.map((label) => ({
                value: label,
                label,
              })),
            });
        }
        expect(
          await tx.questionnaireResponse.findUnique({
            where: { id: response.id },
          }),
        ).toEqual(response);
        await tx.$executeRawUnsafe(sql);
        expect(
          await tx.questionnaireVersion.count({ where: { isCurrent: true } }),
        ).toBe(1);
        expect(
          (
            await tx.questionnaireVersion.findFirstOrThrow({
              where: { isCurrent: true },
            })
          ).id,
        ).toBe(current.id);
      });
    },
  );
});
