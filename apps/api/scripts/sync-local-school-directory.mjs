import { SCHOOL_DIRECTORY } from '@lilink/shared';
import { loadPrismaClientModule } from './prisma-client.mjs';

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink') throw new Error('Requires the local development lilink database.');
const { PrismaClient, createPrismaClientOptions } = await loadPrismaClientModule();
const prisma = new PrismaClient(createPrismaClientOptions());
try {
  const before = await prisma.school.findMany({ include: { _count: { select: { users: true } } } });
  const obsolete = before.filter(s => !SCHOOL_DIRECTORY.some(d => d.slug === s.slug));
  for (const school of obsolete) {
    if (school._count.users && !school.id.startsWith('community-demo-v1-school-')) {
      throw new Error('An unlisted school has users; explicit reconciliation is required.');
    }
  }
  const demoUsers = await prisma.user.findMany({ where: { schoolId: { in: obsolete.map(s => s.id) } }, select: { id: true, email: true } });
  if (demoUsers.some(u => !u.id.startsWith('community-demo-v1-user-') || u.email !== `${u.id}@example.invalid`)) {
    throw new Error('Refusing to reassign a non-fixture account.');
  }
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ directorySchools: SCHOOL_DIRECTORY.length, replaceEmptyOrFixtureSchools: obsolete.length, retainFixtureUsers: demoUsers.length }));
  } else {
    await prisma.$transaction(async tx => {
      const schoolIds = [];
      for (const entry of SCHOOL_DIRECTORY) {
        const school = await tx.school.upsert({ where: { slug: entry.slug },
          update: { name: entry.name, description: entry.description, registrationEligible: true },
          create: { slug: entry.slug, name: entry.name, description: entry.description, registrationEligible: true } });
        schoolIds.push(school.id);
        for (const domain of entry.domains) {
          await tx.schoolDomain.upsert({ where: { domain }, update: { schoolId: school.id }, create: { domain, schoolId: school.id } });
        }
        await tx.schoolDomain.deleteMany({ where: { schoolId: school.id, domain: { notIn: entry.domains } } });
      }
      for (const user of demoUsers) {
        const number = Number(user.id.split('-').at(-1));
        await tx.user.update({ where: { id: user.id }, data: { schoolId: schoolIds[number % schoolIds.length] } });
      }
      for (const school of obsolete) {
        await tx.schoolDomain.deleteMany({ where: { schoolId: school.id } });
        await tx.school.delete({ where: { id: school.id } });
      }
    }, { timeout: 60000 });
    console.log(`Local directory synchronized: ${SCHOOL_DIRECTORY.length} schools; ${demoUsers.length} fixture accounts retained.`);
  }
} finally { await prisma.$disconnect(); }
