import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { HARD_MATCH_KEYS } from '@lilink/shared';
import { loadPrismaClientModule } from './prisma-client.mjs';

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink' || !process.argv.includes('--apply')) {
  throw new Error('Requires APP_ENV=development, local lilink database, and --apply.');
}
const { PrismaClient, createPrismaClientOptions } = await loadPrismaClientModule();
const prisma = new PrismaClient(createPrismaClientOptions());
const prefix = 'community-demo-v1';

try {
  const schools = await prisma.school.findMany({ where: { registrationEligible: true, domains: { some: {} } }, orderBy: { name: 'asc' } });
  if (!schools.length) throw new Error('Initialize the school directory before seeding local users.');
  const passwordHash = await argon2.hash(randomBytes(48).toString('hex'));
  await prisma.$transaction(async tx => {
    await tx.questionnaireVersion.upsert({ where: { id: prefix }, update: {}, create: { id: prefix, title: '本地人数图表测试问卷', isCurrent: false } });
    for (let index = 0; index < 168; index++) {
        const schoolId = schools[index % schools.length].id;
        const id = `${prefix}-user-${index}`;
        const exists = await tx.user.findUnique({ where: { id }, select: { email: true, displayName: true } });
        if (exists) {
          if (exists.email !== `${id}@example.invalid` || exists.displayName !== `本地测试同学 ${index + 1}`) throw new Error('Refusing to change a record not owned by this local seed.');
          await tx.user.update({ where: { id }, data: { isTest: false, schoolId } });
          continue;
        }
        const slot = index % 84;
        const gender = slot < 39 ? '男' : slot < 77 ? '女' : slot < 82 ? '非二元' : null;
        await tx.user.create({ data: {
          id, email: `${id}@example.invalid`, passwordHash, status: 'ACTIVE', isTest: false,
          displayName: `本地测试同学 ${index + 1}`, schoolId,
          ...(gender ? { questionnaireResponse: { create: { versionId: prefix, answers: { [HARD_MATCH_KEYS.gender]: gender }, submittedAt: new Date() } } } : {}),
        } });
    }
  }, { timeout: 60000 });
  const count = await prisma.user.count({ where: { id: { startsWith: `${prefix}-user-` }, isTest: false } });
  console.log(`Local community demo ready: ${count} simulated local users, ${schools.length} configured schools. No match participation or emails created.`);
} finally { await prisma.$disconnect(); }
