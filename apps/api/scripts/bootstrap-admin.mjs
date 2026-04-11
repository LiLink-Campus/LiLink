import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { loadMonorepoEnv } from './load-env.mjs';

loadMonorepoEnv();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const displayName = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'LiLink Admin';

  if (!email || !password) {
    console.log('Admin bootstrap skipped.');
    return;
  }

  const existingOperator = await prisma.adminOperator.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingOperator) {
    console.log('Admin bootstrap skipped because the operator already exists.');
    return;
  }

  const passwordHash = await argon2.hash(password);

  await prisma.adminOperator.create({
    data: {
      email,
      passwordHash,
      displayName,
    },
  });

  console.log(`Admin bootstrap completed for ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
