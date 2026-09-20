import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { createPrismaClient } = require('./dist/src/common/prisma/client.js');
const { buildHardMatchAnswerRecordFromFormInput } = require('./dist/src/modules/questionnaire/hard-match.js');
const { validateQuestionnaireAnswers } = require('./dist/src/modules/questionnaire/questionnaire.service.js');
const argon2 = require('argon2');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== 'ep-crimson-thunder-aztzdzla.c-3.ap-southeast-1.aws.neon.tech' || url.pathname !== '/neondb' || url.username !== 'release_load') throw new Error('Refusing seed outside the dedicated synthetic release project.');
const db = createPrismaClient();
try {
  const existing = await db.user.count();
  if (existing === 2000 && await db.user.count({ where: { id: { startsWith: 'release_user_' }, email: { endsWith: '@release.example.test' } } }) === 2000) { console.log('Reusing verified synthetic release dataset.'); await db.$disconnect(); process.exit(0); }
  if (existing || await db.questionnaireVersion.count()) throw new Error('Synthetic load database must be empty; no automatic deletion.');
  const { questions } = JSON.parse(await readFile('prisma/fixtures/autumn-20260920-questionnaire.json', 'utf8'));
  const schoolIds = Array.from({ length: 8 }, (_, i) => `release_school_${i}`);
  await db.school.createMany({ data: schoolIds.map((id, i) => ({ id, slug: id, name: `测试大学 ${i}` })) });
  const version = await db.questionnaireVersion.create({ data: { id: 'release_autumn_20260920', title: '秋季合成压测', isCurrent: true, questions: { create: questions } } });
  const soft = Object.fromEntries(questions.map(q => [q.key, q.type === 'MULTI_SELECT' ? q.options.slice(0, q.selectionLimit ?? 1).map(o => o.value) : q.options[0].value]));
  const passwordHash = await argon2.hash('SyntheticRelease2026!');
  const users = Array.from({ length: 2000 }, (_, i) => ({ id: `release_user_${String(i).padStart(4, '0')}`, email: `user${i}@release.example.test`, passwordHash, displayName: `演练同学 ${i}`, status: 'ACTIVE', schoolId: schoolIds[i % schoolIds.length], isTest: false, acceptedTermsAt: new Date() }));
  const forms = users.map((user, i) => ({ birthYear: '2000', birthMonth: '1', birthDay: '1', gender: i % 2 ? '男' : '女', partnerGenders: ['男', '女'], partnerAgeMin: '18', partnerAgeMax: '40', nationality: '中国', languages: ['中文'], partnerNationalities: [], partnerLanguages: [], looks: '5', partnerLooks: ['1','2','3','4','5','6','7','8','9','10'], heightCm: '165', weightKg: '55', partnerHeightMin: '120', partnerHeightMax: '230', partnerWeightMin: '30', partnerWeightMax: '300', oneLinerIntro: `合成用户 ${i} 喜欢读书和散步。`, excludedPartnerSchools: [], excludedPartnerSchoolGenders: [] }));
  const responses = users.map((user, i) => {
    const answers = { ...soft, ...buildHardMatchAnswerRecordFromFormInput(forms[i], user.schoolId, schoolIds) };
    validateQuestionnaireAnswers(questions, answers, schoolIds);
    return { id: `release_response_${i}`, userId: user.id, versionId: version.id, answers, submittedAt: new Date() };
  });
  for (let i = 0; i < users.length; i += 100) {
    await db.user.createMany({ data: users.slice(i, i + 100) });
    await db.questionnaireResponse.createMany({ data: responses.slice(i, i + 100) });
  }
  for (let round = 0; round < 3; round++) {
    const cycle = await db.matchCycle.create({ data: { id: `release_history_${round}`, codename: `历史演练 ${round}`, status: 'REVEALED', participationDeadline: new Date(Date.now() - (round + 1) * 86400000), revealAt: new Date(Date.now() - (round + 1) * 86400000) } });
    await db.cycleParticipation.createMany({ data: users.slice(0, 1500).map(user => ({ cycleId: cycle.id, userId: user.id, status: 'OPTED_IN', intent: 'BOTH', optedInAt: new Date(Date.now() - 7 * 86400000) })) });
    const matches = Array.from({ length: 500 }, (_, i) => ({ id: `release_match_${round}_${i}`, cycleId: cycle.id, score: 70 + i % 30, revealedAt: cycle.revealAt, introducedAt: cycle.revealAt }));
    await db.match.createMany({ data: matches });
    await db.matchParticipant.createMany({ data: matches.flatMap((match, i) => [0, 1].map(position => ({ cycleId: cycle.id, matchId: match.id, userId: users[i * 2 + position].id, position, introducedContactType: 'EMAIL', introducedContactValue: users[i * 2 + position].email, profileSnapshot: { source: 'synthetic-history', versionId: version.id, introLine: '合成历史介绍', gender: forms[i * 2 + position].gender, partnerGenders: ['男', '女'] } }))) });
  }
  await db.matchCycle.create({ data: { id: 'release_current', codename: '本轮演练', status: 'OPEN', participationDeadline: new Date(Date.now() + 8 * 3600000), revealAt: new Date(Date.now() + 9 * 3600000) } });
  console.log('Synthetic release data ready: 2000 users, 24 questions, 3 history cycles, 1500 historical pairs.');
} finally { await db.$disconnect(); }
