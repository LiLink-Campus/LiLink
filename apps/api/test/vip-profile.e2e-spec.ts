import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AccountService } from '../src/modules/account/account.service';
import { QuestionnaireService } from '../src/modules/questionnaire/questionnaire.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import {
  HARD_MATCH_LOOKS,
  LIFESTYLE_QUESTIONS,
  HARD_MATCH_KEYS as K,
} from '@lilink/shared';

const fixture = `vip-profile-${randomUUID()}`;
describe('VIP profile persistence and actual matching eligibility (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let account: AccountService;
  let cycles: CyclesService;
  let userId: string;
  let schoolId: string;
  let versionId: string;
  const form = {
    birthYear: '2000',
    birthMonth: '1',
    birthDay: '1',
    gender: '女',
    partnerGenders: ['男'],
    partnerAgeMin: '18',
    partnerAgeMax: '40',
    nationality: '中国',
    languages: ['中文'],
    partnerNationalities: [],
    partnerLanguages: [],
    looks: '5',
    partnerLooks: ['8', '9', '10'],
    heightCm: '165',
    weightKg: '55',
    partnerHeightMin: '180',
    partnerHeightMax: '190',
    partnerWeightMin: '60',
    partnerWeightMax: '70',
    oneLinerIntro: '喜欢一起散步。',
    excludedPartnerSchools: [] as string[],
    excludedPartnerSchoolGenders: [],
  };
  const answers = Object.fromEntries(
    LIFESTYLE_QUESTIONS.map((q) => [q.key, q.options[1]]),
  );
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.startsWith('/lilink_vip_test_')
    )
      throw new Error('Dedicated local VIP test database required');
    prisma = createPrismaClient();
    const school = await prisma.school.create({
      data: { name: '筛选测试大学', slug: fixture },
    });
    schoolId = school.id;
    form.excludedPartnerSchools = [schoolId];
    const version = await prisma.questionnaireVersion.create({
      data: {
        title: fixture,
        isCurrent: true,
        questions: {
          create: LIFESTYLE_QUESTIONS.map((q, order) => ({
            key: q.key,
            prompt: q.prompt,
            order,
            type: 'SINGLE_SELECT',
            required: true,
            weight: 0,
            options: q.options.map((value) => ({ value, label: value })),
          })),
        },
      },
    });
    versionId = version.id;
    const user = await prisma.user.create({
      data: {
        email: `${fixture}@example.invalid`,
        displayName: '测试同学',
        passwordHash: 'unusable',
        status: 'ACTIVE',
        schoolId,
      },
    });
    userId = user.id;
    const snapshot = {
      syncUserMatchSnapshots: jest.fn().mockResolvedValue(undefined),
    };
    account = new AccountService(
      prisma as PrismaService,
      new QuestionnaireService(prisma as PrismaService),
      snapshot as never,
    );
    cycles = new CyclesService(
      prisma as PrismaService,
      snapshot as never,
      {} as never,
    );
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.vipActivation.deleteMany({ where: { batch: fixture } });
    await prisma.questionnaireResponse.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.question.deleteMany({ where: { versionId } });
    await prisma.questionnaireVersion.deleteMany({ where: { id: versionId } });
    await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.$disconnect();
  });
  it('saves lifestyle answers, ignores forged premium filters, and restores from the database', async () => {
    const result = await account.saveQuestionnaire(userId, {
      answers,
      hardMatchForm: form,
      displayName: '测试同学',
    });
    expect(result.saveState).toBe('SUBMITTED');
    const saved = await account.getQuestionnaire(userId);
    expect(saved?.answers).toMatchObject({
      ...answers,
      [K.partnerHeightMin]: 120,
      [K.partnerLooks]: [...HARD_MATCH_LOOKS],
      [K.excludedPartnerSchools]: [],
    });
    const incomplete = await account.saveQuestionnaire(userId, {
      answers: { ...answers, exercise_frequency: undefined },
      hardMatchForm: form,
      displayName: '测试同学',
    });
    expect(incomplete.saveState).toBe('DRAFT');
    expect(
      (await account.getQuestionnaire(userId))?.draft?.softAnswers
        .smoking_status,
    ).toBe(answers.smoking_status);
  });
  it('applies premium filters when active, then ignores them after expiry or revocation', async () => {
    const grant = await prisma.vipActivation.create({
      data: {
        codeHash: fixture,
        batch: fixture,
        userId,
        activatedAt: new Date(Date.now() - 5000),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (
        await account.saveQuestionnaire(userId, {
          answers,
          hardMatchForm: form,
          displayName: '测试同学',
        })
      ).saveState,
    ).toBe('SUBMITTED');
    async function effective() {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          school: true,
          vipActivations: true,
          questionnaireResponse: true,
        },
      });
      return (
        cycles as unknown as {
          toEligibleParticipants: (rows: unknown[]) => Array<{
            hardMatchAnswers: {
              partnerHeightMin: number;
              excludedPartnerSchools: string[];
            };
          }>;
        }
      ).toEligibleParticipants([{ intent: 'DATE', user }])[0].hardMatchAnswers;
    }
    expect(await effective()).toMatchObject({
      partnerHeightMin: 180,
      excludedPartnerSchools: [schoolId],
    });
    await prisma.vipActivation.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await effective()).toMatchObject({
      partnerHeightMin: 120,
      excludedPartnerSchools: [],
    });
    await prisma.vipActivation.update({
      where: { id: grant.id },
      data: { expiresAt: new Date(Date.now() + 60000), revokedAt: new Date() },
    });
    expect(await effective()).toMatchObject({
      partnerHeightMin: 120,
      excludedPartnerSchools: [],
    });
  });
});
