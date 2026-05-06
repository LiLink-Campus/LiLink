import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const DATABASE_URL_ENV = 'DATABASE_URL';

export * from '../../generated/prisma/client';
export { PrismaClient };

export function readDatabaseUrl() {
  const databaseUrl = process.env[DATABASE_URL_ENV]?.trim();

  if (!databaseUrl) {
    throw new Error(`${DATABASE_URL_ENV} is required.`);
  }

  return databaseUrl;
}

export function createPrismaClientOptions() {
  return {
    adapter: new PrismaPg({ connectionString: readDatabaseUrl() }),
  };
}

export function createPrismaClient() {
  return new PrismaClient(createPrismaClientOptions());
}
