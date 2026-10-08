import { AdminQuestionnaireService } from '../src/modules/admin/admin-questionnaire.service';
import { AdminQuestionnaireRevisionService } from '../src/modules/admin/admin-questionnaire-revision.service';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LIFESTYLE_QUESTIONS,
  HARD_MATCH_KEYS as K,
  HARD_MATCH_LOOKS,
  parseHardMatchAnswers,
  areHardMatchAnswersCompatible,
} from '@lilink/shared';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { UpsertQuestionDto } from '../src/modules/admin/dto';
import { QuestionnaireService } from '../src/modules/questionnaire/questionnaire.service';
import { PublicService } from '../src/modules/public/public.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { AccountQuestionnaireService } from '../src/modules/account/account-questionnaire.service';

const tag = `question-contract-${randomUUID()}`;
const base = {
  [K.birthDate]: '2003-06-15',
  [K.partnerAgeMin]: 18,
  [K.partnerAgeMax]: 30,
  [K.gender]: '男',
  [K.partnerGenders]: ['男', '女'],
  [K.looks]: '5',
  [K.partnerLooks]: [...HARD_MATCH_LOOKS],
  [K.heightCm]: 170,
  [K.partnerHeightMin]: 120,
  [K.partnerHeightMax]: 230,
  [K.weightKg]: 60,
  [K.school]: 'synthetic-school',
  [K.oneLinerIntro]: 'Synthetic intro',
};

describe('Questionnaire configuration contracts (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let admin: AdminQuestionnaireService;
  let originalCurrent: string[];
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      !target.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error(
        'Requires a disposable local lilink_vip_test_* database.',
      );
    }
    prisma = createPrismaClient();
    originalCurrent = (
      await prisma.questionnaireVersion.findMany({ where: { isCurrent: true } })
    ).map((v) => v.id);
    await prisma.questionnaireVersion.updateMany({
      where: { id: { in: originalCurrent } },
      data: { isCurrent: false },
    });
    await prisma.questionnaireVersion.create({
      data: { title: tag, isCurrent: true },
    });
    admin = new AdminQuestionnaireService(
      prisma as PrismaService,
      { write: jest.fn() } as never,
      { invalidateCurrentQuestionnaireCache: jest.fn() } as never,
      new AdminQuestionnaireRevisionService(
        prisma as PrismaService,
        { invalidateCurrentQuestionnaireCache: jest.fn() } as never,
      ),
    );
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${tag}.invalid` } },
    });
    await prisma.questionnaireVersion.deleteMany({ where: { title: tag } });
    await prisma.questionnaireVersion.updateMany({
      where: { id: { in: originalCurrent } },
      data: { isCurrent: true },
    });
    await prisma.matchCycle.deleteMany({ where: { codename: tag } });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${tag}.invalid` } },
    });
    await prisma.school.deleteMany({ where: { slug: { startsWith: tag } } });
    await prisma.$disconnect();
  });

  // A real PostgreSQL exception after the nickname write must roll back every
  // saved field. Array transactions and callback transactions cover different paths.
  it.each(['draft', 'signatures'] as const)(
    'rolls back nickname, answers and signatures when the %s write fails, then retries',
    async (boundary) => {
      const school = await prisma.school.create({
        data: { name: tag, slug: `${tag}-${boundary}` },
      });
      const questionnaire = new QuestionnaireService(prisma as PrismaService);
      const version = await questionnaire.getCurrentVersion();
      const user = await prisma.user.create({
        data: {
          email: `${boundary}@${tag}.invalid`,
          passwordHash: 'synthetic',
          displayName: '原有昵称',
          status: 'ACTIVE',
          schoolId: school.id,
          questionnaireResponse: {
            create: {
              versionId: version.id,
              answers: { previous: 'preserved' },
              draftAnswers: { previous: 'draft' },
              acknowledgedHardMatchSignatures: { previous: 'signature' },
            },
          },
        },
      });
      const before = await prisma.questionnaireResponse.findUniqueOrThrow({
        where: { userId: user.id },
      });
      const account = new AccountQuestionnaireService(
        prisma as PrismaService,
        questionnaire,
        new DashboardSnapshotService(prisma as PrismaService),
      );
      const input = {
        versionId: version.id,
        displayName: '新的昵称',
        answers: Object.fromEntries(
          LIFESTYLE_QUESTIONS.filter((q) =>
            version.questions.some((question) => question.key === q.key),
          ).map((q) => [q.key, q.options[0]]),
        ),
        hardMatchForm: {
          birthYear: boundary === 'draft' ? '' : '2000',
          birthMonth: '1',
          birthDay: '1',
          gender: '女',
          partnerGenders: ['男'],
          partnerAgeMin: '18',
          partnerAgeMax: '40',
          looks: '5',
          partnerLooks: [...HARD_MATCH_LOOKS],
          heightCm: '165',
          weightKg: '55',
          partnerHeightMin: '150',
          partnerHeightMax: '200',
          oneLinerIntro: '合成事务验收资料。',
        },
      };
      const name = `questionnaire_failure_${randomUUID().replaceAll('-', '')}`;
      const condition =
        boundary === 'draft'
          ? 'NEW."draftAnswers" IS DISTINCT FROM OLD."draftAnswers"'
          : 'NEW."acknowledgedHardMatchSignatures" IS DISTINCT FROM OLD."acknowledgedHardMatchSignatures"';
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW."userId" = '${user.id}' AND ${condition} THEN RAISE EXCEPTION 'synthetic questionnaire persistence failure'; END IF;
        RETURN NEW; END $$`);
      try {
        await prisma.$executeRawUnsafe(
          `CREATE TRIGGER "${name}" BEFORE UPDATE ON "QuestionnaireResponse" FOR EACH ROW EXECUTE FUNCTION "${name}"()`,
        );
        await expect(account.saveQuestionnaire(user.id, input)).rejects.toThrow(
          'synthetic questionnaire persistence failure',
        );
        expect(
          await prisma.questionnaireResponse.findUniqueOrThrow({
            where: { userId: user.id },
          }),
        ).toEqual(before);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
            .displayName,
        ).toBe('原有昵称');
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS "${name}" ON "QuestionnaireResponse"`,
        );
        await prisma.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
      }
      expect((await account.saveQuestionnaire(user.id, input)).saveState).toBe(
        boundary === 'draft' ? 'DRAFT' : 'SUBMITTED',
      );
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
          .displayName,
      ).toBe('新的昵称');
      const saved = await account.getQuestionnaire(user.id);
      if (boundary === 'draft')
        expect(saved?.draft?.displayName).toBe('新的昵称');
      else {
        expect(saved?.submittedAt).not.toBeNull();
        expect(saved?.answers[K.gender]).toBe('女');
        expect(
          (
            await prisma.questionnaireResponse.findUniqueOrThrow({
              where: { userId: user.id },
            })
          ).acknowledgedHardMatchSignatures,
        ).not.toEqual(before.acknowledgedHardMatchSignatures);
      }
    },
  );

  it.each(LIFESTYLE_QUESTIONS)(
    'keeps $key compatible after editing its display label at weight zero',
    async (lifestyle) => {
      const input = {
        key: lifestyle.key,
        prompt: lifestyle.prompt,
        type: 'SINGLE_SELECT' as const,
        options: lifestyle.options.map((value) => ({ value, label: value })),
        order: 1,
        weight: 0,
      };
      expect(await validate(plainToInstance(UpsertQuestionDto, input))).toEqual(
        [],
      );
      const created = await admin.upsertQuestion(input, 'synthetic-admin');
      const label = `显示文案：${lifestyle.options[0]}`;
      const updated = await admin.upsertQuestion(
        {
          ...input,
          questionId: created.id,
          options: input.options.map((o, i) => (i === 0 ? { ...o, label } : o)),
        },
        'synthetic-admin',
      );
      expect(updated.weight).toBe(0);
      const saved = new QuestionnaireService(
        prisma as PrismaService,
      ).validateAnswers([updated], { ...base, [lifestyle.key]: label }, [
        'synthetic-school',
      ]);
      expect(saved[lifestyle.key]).toBe(lifestyle.options[0]);
      const filter =
        lifestyle.key === 'smoking_status'
          ? K.partnerSmokingStatus
          : lifestyle.key === 'drinking_frequency'
            ? K.partnerDrinkingFrequency
            : K.partnerExerciseFrequency;
      const seeker = parseHardMatchAnswers({
        ...base,
        [filter]: [lifestyle.options[0]],
      })!;
      expect(
        areHardMatchAnswersCompatible(seeker, parseHardMatchAnswers(saved)!),
      ).toBe(true);
      for (const mutation of [
        { type: 'MULTI_SELECT' as const },
        { options: input.options.slice(1) },
        {
          options: input.options.map((o, i) =>
            i === 0 ? { value: 'replacement', label: o.label } : o,
          ),
        },
      ]) {
        await expect(
          admin.upsertQuestion(
            { ...input, questionId: updated.id, ...mutation },
            'synthetic-admin',
          ),
        ).rejects.toThrow('生活习惯题');
      }
      await expect(
        admin.deleteQuestion(updated.id, 'synthetic-admin'),
      ).rejects.toThrow('不能删除');
    },
  );

  it('counts introduced results, excluding skipped pairs that read as unmatched', async () => {
    const users = await Promise.all(
      ['a', 'b'].map((x) =>
        prisma.user.create({
          data: {
            email: `${x}@${tag}.invalid`,
            passwordHash: 'synthetic',
            status: 'ACTIVE',
          },
        }),
      ),
    );
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: tag,
        status: 'REVEALED',
        revealAt: new Date(),
        participationDeadline: new Date(Date.now() - 3600000),
        participations: {
          create: users.map((u) => ({
            userId: u.id,
            status: 'OPTED_IN',
            intent: 'BOTH',
          })),
        },
      },
    });
    const before = (
      await new PublicService(prisma as PrismaService).getLandingPayload()
    ).stats.matchesDelivered;
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        revealedAt: new Date(),
        participants: {
          create: users.map((u, position) => ({
            userId: u.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    await new DashboardSnapshotService(
      prisma as PrismaService,
    ).syncMatchSnapshots(match.id);
    expect(
      (
        await prisma.userCycleDashboardSnapshot.findMany({
          where: { cycleId: cycle.id },
        })
      ).map((s) => s.result),
    ).toEqual(['UNMATCHED', 'UNMATCHED']);
    expect(
      (await new PublicService(prisma as PrismaService).getLandingPayload())
        .stats.matchesDelivered,
    ).toBe(before);
    await prisma.match.update({
      where: { id: match.id },
      data: { introducedAt: new Date() },
    });
    expect(
      (await new PublicService(prisma as PrismaService).getLandingPayload())
        .stats.matchesDelivered,
    ).toBe(before + 1);
  });
});
