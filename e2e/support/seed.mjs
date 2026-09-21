import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { assertTestDatabase } from '../../scripts/e2e/environment.mjs';
assertTestDatabase(process.env.DATABASE_URL);
const require = createRequire(import.meta.url);
const { createPrismaClient } = require('../../apps/api/dist/src/common/prisma/client.js');
const db = createPrismaClient();
try {
  const fixture = JSON.parse(await readFile(new URL('../../apps/api/prisma/fixtures/autumn-20260920-questionnaire.json', import.meta.url), 'utf8'));
  await db.$transaction(async tx => {
    await tx.questionnaireVersion.updateMany({ data: { isCurrent: false } });
    await tx.questionnaireVersion.create({ data: {
      id: 'e2e-autumn-20260920', title: '秋季正式问卷', isCurrent: true,
      questions: { create: fixture.questions },
    } });
  });
  await db.school.create({ data: { name: '自动化测试大学', slug: 'e2e-school', domains: { create: { domain: 'school.example.test' } } } });
  console.log('Synthetic E2E school ready.');
} finally { await db.$disconnect(); }
