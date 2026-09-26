import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { runMatching } = require('./dist/src/modules/cycles/matching.executor.js');
const { buildHardMatchAnswerRecordFromFormInput } = require('./dist/src/modules/questionnaire/hard-match.js');
const { parseHardMatchAnswers } = require('@lilink/shared');
const { questions } = JSON.parse(await readFile('prisma/fixtures/autumn-20260920-questionnaire.json', 'utf8'));
const soft = Object.fromEntries(questions.map(q => [q.key, q.type === 'MULTI_SELECT' ? q.options.slice(0, q.selectionLimit ?? 1).map(o => o.value) : q.options[0].value]));
const answers = { ...soft, ...buildHardMatchAnswerRecordFromFormInput({
  birthYear: '2000', birthMonth: '1', birthDay: '1', gender: '女', partnerGenders: ['女'], partnerAgeMin: '18', partnerAgeMax: '40', nationality: '中国', languages: ['中文'], partnerNationalities: [], partnerLanguages: [], looks: '5', partnerLooks: Array.from({ length: 10 }, (_, i) => String(i + 1)), heightCm: '165', weightKg: '55', partnerHeightMin: '120', partnerHeightMax: '230', partnerWeightMin: '30', partnerWeightMax: '300', oneLinerIntro: 'Synthetic benchmark', excludedPartnerSchools: [], excludedPartnerSchoolGenders: [],
}, 'benchmark-school', ['benchmark-school']) };
const hardMatchAnswers = parseHardMatchAnswers(answers);
assert.ok(hardMatchAnswers);

for (const count of [500, 1000, 2000]) {
  const delay = monitorEventLoopDelay({ resolution: 20 });
  delay.enable();
  let maxRss = 0;
  const timer = setInterval(() => { maxRss = Math.max(maxRss, process.memoryUsage().rss); }, 50);
  const start = performance.now();
  try {
    const result = await runMatching({
      participants: Array.from({ length: count }, (_, i) => ({ id: `benchmark-${String(i).padStart(4, '0')}`, displayName: null, questionnaireVersionId: null, answers, hardMatchAnswers, intent: 'BOTH' })),
      questions, revealAt: new Date('2026-09-20T00:00:00Z'), questionnairesByVersionId: new Map(), blockedPairKeys: new Set(), historicalPairKeys: new Set(), unmatchedStreaks: new Map(), firstCycleParticipantIds: new Set(),
    });
    assert.equal(result.candidateCount, count * (count - 1) / 2);
    assert.equal(result.selectedPairs.length, count / 2);
    assert.equal(new Set(result.selectedPairs.flatMap(p => [p.left.id, p.right.id])).size, count);
    console.log(JSON.stringify({ participants: count, candidates: result.candidateCount, matches: result.selectedPairs.length, ms: Math.round(performance.now() - start), maxRssMiB: Math.round(maxRss / 1024 / 1024), eventLoopP99Ms: delay.percentile(99) / 1e6, eventLoopMaxMs: delay.max / 1e6 }));
  } finally { clearInterval(timer); delay.disable(); }
}
