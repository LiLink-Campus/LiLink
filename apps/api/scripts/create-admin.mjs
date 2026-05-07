import argon2 from 'argon2';
import { loadMonorepoEnv } from './load-env.mjs';
import { loadPrismaClientModule } from './prisma-client.mjs';

loadMonorepoEnv();

let prisma;

function readArgument(name) {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((value) => value.startsWith(prefixed));

  if (direct) {
    return direct.slice(prefixed.length);
  }

  const index = process.argv.findIndex((value) => value === `--${name}`);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

async function main() {
  const email =
    readArgument('email')?.trim().toLowerCase() ??
    process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = readArgument('password') ?? process.env.ADMIN_PASSWORD;
  const displayName =
    readArgument('name')?.trim() ?? process.env.ADMIN_NAME?.trim() ?? null;

  if (!email || !password) {
    throw new Error('Both --email and --password are required.');
  }

  const { createPrismaClient } = await loadPrismaClientModule();
  prisma = createPrismaClient();

  const existingOperator = await prisma.adminOperator.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingOperator) {
    throw new Error(`Admin operator ${email} already exists.`);
  }

  const passwordHash = await argon2.hash(password);

  await prisma.adminOperator.create({
    data: {
      email,
      passwordHash,
      displayName,
    },
  });

  console.log(`Admin operator created: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
