import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createPrismaClient,
  type PrismaClient,
  type Prisma,
} from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { buildHardMatchAnswerRecordFromFormInput } from '../src/modules/questionnaire/hard-match';
import { validateQuestionnaireAnswers } from '../src/modules/questionnaire/questionnaire.service';

describe('Atomic matching batch (PostgreSQL)', () => {
  const tag = `batch-${randomUUID()}`;
  let db: PrismaClient;
  let cycles: CyclesService;
  let originalCurrent: string[] = [];

  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.port === '5432' ||
      !target.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error(
        'Requires a disposable local lilink_vip_test_* database.',
      );
    }
    db = createPrismaClient();
    originalCurrent = (
      await db.questionnaireVersion.findMany({
        where: { isCurrent: true },
        select: { id: true },
      })
    ).map((v) => v.id);
    const fixture = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../prisma/fixtures/autumn-20260920-questionnaire.json',
        ),
        'utf8',
      ),
    ) as { questions: Prisma.QuestionCreateWithoutVersionInput[] };
    await db.school.create({ data: { id: tag, name: tag, slug: tag } });
    await db.questionnaireVersion.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    });
    const version = await db.questionnaireVersion.create({
      data: {
        id: tag,
        title: tag,
        isCurrent: true,
        questions: { create: fixture.questions },
      },
      include: { questions: true },
    });
    const answers = {
      ...Object.fromEntries(
        version.questions.map((q) => {
          const options = q.options as { value: string }[];
          return [
            q.key,
            q.type === 'MULTI_SELECT'
              ? options.slice(0, q.selectionLimit ?? 1).map((o) => o.value)
              : options[0].value,
          ];
        }),
      ),
      ...buildHardMatchAnswerRecordFromFormInput(
        {
          birthYear: '2000',
          birthMonth: '1',
          birthDay: '1',
          gender: '女',
          partnerGenders: ['女'],
          partnerAgeMin: '18',
          partnerAgeMax: '40',
          nationality: '中国',
          languages: ['中文'],
          partnerNationalities: [],
          partnerLanguages: [],
          looks: '5',
          partnerLooks: Array.from({ length: 10 }, (_, i) => String(i + 1)),
          heightCm: '165',
          weightKg: '55',
          partnerHeightMin: '120',
          partnerHeightMax: '230',
          partnerWeightMin: '30',
          partnerWeightMax: '300',
          oneLinerIntro: 'Synthetic batch profile',
          excludedPartnerSchools: [],
          excludedPartnerSchoolGenders: [],
        },
        tag,
        [tag],
      ),
    };
    validateQuestionnaireAnswers(version.questions, answers, [tag]);
    const users = Array.from({ length: 500 }, (_, i) => ({
      id: `${tag}-${i}`,
      email: `${tag}-${i}@example.test`,
      passwordHash: 'unused-test-hash',
      status: 'ACTIVE' as const,
      schoolId: tag,
    }));
    await db.user.createMany({ data: users });
    await db.questionnaireResponse.createMany({
      data: users.map((u) => ({
        userId: u.id,
        versionId: tag,
        submittedAt: new Date(),
        answers,
      })),
    });
    await db.matchCycle.create({
      data: {
        id: tag,
        codename: tag,
        status: 'OPEN',
        participationDeadline: new Date(Date.now() - 60_000),
        revealAt: new Date(Date.now() + 3600_000),
      },
    });
    await db.cycleParticipation.createMany({
      data: users.map((u) => ({
        cycleId: tag,
        userId: u.id,
        status: 'OPTED_IN',
        intent: 'BOTH',
        optedInAt: new Date(),
      })),
    });
    const mail = new MailService(db as PrismaService);
    jest.spyOn(mail, 'flushQueuedEmails').mockResolvedValue(undefined);
    cycles = new CyclesService(
      db as PrismaService,
      new DashboardSnapshotService(db as PrismaService),
      mail,
    );
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    jest.restoreAllMocks();
    await db.outboundEmail.deleteMany({
      where: { recipientEmail: { startsWith: tag } },
    });
    await db.auditLog.deleteMany({
      where: { metadata: { path: ['cycleId'], equals: tag } },
    });
    await db.matchCycle.deleteMany({ where: { id: tag } });
    await db.user.deleteMany({ where: { schoolId: tag } });
    await db.questionnaireVersion.deleteMany({ where: { id: tag } });
    await db.questionnaireVersion.updateMany({
      where: { id: { in: originalCurrent } },
      data: { isCurrent: true },
    });
    await db.school.deleteMany({ where: { id: tag } });
    await db.$disconnect();
  });

  it('rolls back a participant conflict, then atomically creates 250 unique frozen pairs on retry', async () => {
    // A conflicting participant forces failure after the match batch is inserted.
    const conflict = await db.match.create({
      data: { cycleId: tag, score: 70 },
    });
    await db.matchParticipant.create({
      data: {
        matchId: conflict.id,
        cycleId: tag,
        userId: `${tag}-0`,
        position: 1,
      },
    });
    await expect(cycles.runRevealCycle({ cycleId: tag })).rejects.toThrow();
    expect(await db.match.count({ where: { cycleId: tag } })).toBe(1);
    expect(await db.matchParticipant.count({ where: { cycleId: tag } })).toBe(
      1,
    );
    await db.match.delete({ where: { id: conflict.id } });
    await db.matchCycle.update({
      where: { id: tag },
      data: { status: 'OPEN' },
    });

    await expect(
      cycles.runRevealCycle({ cycleId: tag }),
    ).resolves.toMatchObject({
      state: 'PREPARED',
      createdMatches: 250,
      unmatchedCount: 0,
    });
    const matches = await db.match.findMany({
      where: { cycleId: tag },
      include: { participants: true },
    });
    expect(matches).toHaveLength(250);
    expect(matches.every((m) => m.participants.length === 2)).toBe(true);
    const participants = matches.flatMap((m) => m.participants);
    expect(new Set(participants.map((p) => p.userId)).size).toBe(500);
    for (const participant of participants) {
      expect(participant.profileSnapshot).toMatchObject({
        source: 'matching-preparation',
        versionId: tag,
        introLine: 'Synthetic batch profile',
      });
    }
    await expect(cycles.runRevealCycle({ cycleId: tag })).rejects.toThrow(
      'Reveal time has not been reached yet.',
    );
    expect(await db.match.count({ where: { cycleId: tag } })).toBe(250);
    await db.questionnaireResponse.update({
      where: { userId: `${tag}-0` },
      data: { answers: { hard_one_liner_intro: 'Changed after preparation' } },
    });
    await db.matchCycle.update({
      where: { id: tag },
      data: { revealAt: new Date(Date.now() - 1000) },
    });
    await expect(
      cycles.runRevealCycle({ cycleId: tag }),
    ).resolves.toMatchObject({ state: 'REVEALED', createdMatches: 250 });
    expect(
      await db.userCycleDashboardSnapshot.count({ where: { cycleId: tag } }),
    ).toBe(500);
    const emails = await db.outboundEmail.findMany({
      where: { recipientEmail: { startsWith: tag } },
      select: { text: true },
    });
    expect(emails).toHaveLength(500);
    expect(
      emails.every((email) => email.text?.includes('Synthetic batch profile')),
    ).toBe(true);
    expect(
      emails.some((email) => email.text?.includes('Changed after preparation')),
    ).toBe(false);
  }, 60_000);
});
