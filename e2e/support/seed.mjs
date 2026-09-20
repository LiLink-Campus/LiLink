import { createRequire } from 'node:module';
import { assertTestDatabase } from '../../scripts/e2e/environment.mjs';
assertTestDatabase(process.env.DATABASE_URL);
const require = createRequire(import.meta.url);
const { createPrismaClient } = require('../../apps/api/dist/src/common/prisma/client.js');
const db = createPrismaClient();
try {
  await db.school.create({ data: { name: '自动化测试大学', slug: 'e2e-school', domains: { create: { domain: 'school.example.test' } } } });
  console.log('Synthetic E2E school ready.');
} finally { await db.$disconnect(); }
