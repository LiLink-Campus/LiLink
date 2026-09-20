import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { HARD_MATCH_KEYS } from '@lilink/shared';
import { loadPrismaClientModule } from './prisma-client.mjs';

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink' || !process.argv.includes('--apply')) {
  throw new Error('Requires local development lilink database and --apply.');
}
const distribution = [
  ['bupt-qmul-hainan', 360], ['cuc-hainan-international', 240],
  ['uestc-glasgow-hainan', 160], ['muc-hainan-international', 110],
  ['bsu-ualberta-hainan', 80], ['blcu-lian-exchange', 55],
  ['tju', 40], ['cupl', 30], ['cugb', 24], ['nefu', 22], ['xjtu', 18],
];
const { PrismaClient, createPrismaClientOptions } = await loadPrismaClientModule();
const prisma = new PrismaClient(createPrismaClientOptions());
const prefix = 'community-varied-v1';
try {
  const hash = await argon2.hash(randomBytes(48).toString('hex'));
  let created = 0;
  await prisma.$transaction(async tx => {
    await tx.questionnaireVersion.upsert({ where: { id: prefix }, update: {}, create: { id: prefix, title: '本地人数分布测试问卷', isCurrent: false } });
    for (const [slug, targetCount] of distribution) {
      const school = await tx.school.findUniqueOrThrow({ where: { slug } });
      const count = await tx.user.count({ where: { schoolId: school.id, status: 'ACTIVE', deactivatedAt: null, isTest: false } });
      for (let n = count; n < targetCount; n++) {
        const id = `${prefix}-${slug}-${n}`;
        if (await tx.user.findUnique({ where: { id } })) throw new Error('Fixture identifier collision; no existing records will be overwritten.');
        const slot = n % 20;
        const gender = slot < 9 ? '男' : slot < 18 ? '女' : '非二元';
        await tx.user.create({ data: {
          id, email: `${id}@example.invalid`, passwordHash: hash, status: 'ACTIVE', isTest: false,
          displayName: `本地分布测试 ${n + 1}`, schoolId: school.id,
          questionnaireResponse: { create: { versionId: prefix, answers: { [HARD_MATCH_KEYS.gender]: gender }, submittedAt: new Date() } },
        } });
        created++;
      }
    }
  }, { timeout: 120000 });
  console.log(`Added ${created} local fixture accounts. Existing accounts preserved; no emails or match participation created.`);
} finally { await prisma.$disconnect(); }
