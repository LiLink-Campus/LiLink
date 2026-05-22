import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from '../../generated/prisma/client';

const DATABASE_URL_ENV = 'DATABASE_URL';
const DATABASE_CONNECTION_LIMIT_ENV = 'DATABASE_CONNECTION_LIMIT';
const DATABASE_POOL_TIMEOUT_SECONDS_ENV = 'DATABASE_POOL_TIMEOUT_SECONDS';
const DEFAULT_DATABASE_CONNECTION_LIMIT = 20;
const DEFAULT_DATABASE_POOL_TIMEOUT_SECONDS = 10;
const MILLISECONDS_PER_SECOND = 1000;

export * from '../../generated/prisma/client';
export { PrismaClient };

/**
 * @internal Exported for configuration tests.
 */
export function readDatabaseUrl() {
  const databaseUrl = process.env[DATABASE_URL_ENV]?.trim();

  if (!databaseUrl) {
    throw new Error(`${DATABASE_URL_ENV} is required.`);
  }

  return databaseUrl;
}

function readPositiveIntegerEnv(name: string, defaultValue: number) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

function readNonNegativeIntegerEnv(name: string, defaultValue: number) {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return value;
}

/**
 * @internal Exported for configuration tests.
 */
export function createPostgresPoolConfig(): PoolConfig {
  const poolTimeoutSeconds = readNonNegativeIntegerEnv(
    DATABASE_POOL_TIMEOUT_SECONDS_ENV,
    DEFAULT_DATABASE_POOL_TIMEOUT_SECONDS,
  );

  return {
    connectionString: readDatabaseUrl(),
    max: readPositiveIntegerEnv(
      DATABASE_CONNECTION_LIMIT_ENV,
      DEFAULT_DATABASE_CONNECTION_LIMIT,
    ),
    connectionTimeoutMillis: poolTimeoutSeconds * MILLISECONDS_PER_SECOND,
  };
}

export function createPrismaClientOptions() {
  return {
    adapter: new PrismaPg(createPostgresPoolConfig()),
  };
}

/**
 * @internal Used by CLI scripts that run outside Nest dependency injection.
 */
export function createPrismaClient() {
  return new PrismaClient(createPrismaClientOptions());
}
