import argon2 from 'argon2';
import { loadMonorepoEnv } from './load-env.mjs';
import { loadPrismaClientModule } from './prisma-client.mjs';

loadMonorepoEnv();

let prisma;

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const displayName = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || 'LiLink Admin';

  if (!email || !password) {
    console.log('Admin bootstrap skipped.');
    return;
  }

  const { createPrismaClient } = await loadPrismaClientModule();
  prisma = createPrismaClient();

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

  // Avoid logging bootstrap email addresses; logs are often centralized and
  // should not carry operator-identifying PII.
  console.log('Admin bootstrap completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
