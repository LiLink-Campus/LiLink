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
import { AdminService } from '../src/modules/admin/admin.service';
import { UpsertQuestionDto } from '../src/modules/admin/dto';
import { QuestionnaireService } from '../src/modules/questionnaire/questionnaire.service';
import { PublicService } from '../src/modules/public/public.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';

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
  let admin: AdminService;
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
    admin = new AdminService(
      prisma as PrismaService,
      {} as never,
      { write: jest.fn() } as never,
      {} as never,
    );
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.questionnaireVersion.deleteMany({ where: { title: tag } });
    await prisma.questionnaireVersion.updateMany({
      where: { id: { in: originalCurrent } },
      data: { isCurrent: true },
    });
    await prisma.matchCycle.deleteMany({ where: { codename: tag } });
    await prisma.user.deleteMany({
      where: { email: { endsWith: `@${tag}.invalid` } },
    });
    await prisma.$disconnect();
  });

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
