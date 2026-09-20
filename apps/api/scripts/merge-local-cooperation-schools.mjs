import { createRequire } from 'node:module';
import { SCHOOL_COOPERATION_GROUPS, SCHOOL_DIRECTORY } from '@lilink/shared';
import { loadPrismaClientModule } from './prisma-client.mjs';

const target = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.APP_ENV !== 'development' || !target ||
    !['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    target.pathname !== '/lilink') throw new Error('Local development database only.');
const { PrismaClient, createPrismaClientOptions } = await loadPrismaClientModule();
const prisma = new PrismaClient(createPrismaClientOptions());
try {
  const schools = await prisma.school.findMany({ include: { _count: { select: { users: true } } } });
  const plan = SCHOOL_COOPERATION_GROUPS.flatMap(group => {
    const entry = SCHOOL_DIRECTORY.find(s => s.id === group.id);
    const destination = schools.find(s => s.slug === entry.slug);
    if (!destination) throw new Error(`Missing destination: ${entry.name}`);
    return group.partners.flatMap(slug => {
      const source = schools.find(s => s.slug === slug);
      return source ? [{ source, destination }] : [];
    });
  });
  console.log(JSON.stringify({ mergeSchools: plan.length, moveUsers: plan.reduce((n, p) => n + p.source._count.users, 0) }));
  if (process.argv.includes('--apply')) {
    const admin = await prisma.adminOperator.findFirstOrThrow({ where: { isActive: true } });
    const require = createRequire(import.meta.url);
    const { JwtService } = require('@nestjs/jwt');
    const token = new JwtService().sign({ sub: admin.id, email: admin.email }, { secret: process.env.ADMIN_JWT_SECRET, expiresIn: '10m' });
    for (const { source, destination } of plan) {
      const response = await fetch(`http://localhost:4000/v1/admin/schools/${source.id}/merge-into/${destination.id}`, {
        method: 'POST', headers: { Cookie: `${process.env.ADMIN_COOKIE_NAME}=${token}`, Origin: 'http://localhost:3000' },
      });
      if (!response.ok) throw new Error(`Merge failed: ${source.slug} (${response.status})`);
      console.log(`${source.name} -> ${destination.name}`);
    }
  }
} finally { await prisma.$disconnect(); }
