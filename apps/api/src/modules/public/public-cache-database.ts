import { PrismaPg } from '@prisma/adapter-pg';
import {
  createPostgresPoolConfig,
  PrismaClient,
} from '../../common/prisma/client';
import { DeadlinePool } from '../../common/prisma/deadline-pool';

export const PUBLIC_CACHE_DATABASE = Symbol('PUBLIC_CACHE_DATABASE');
export const PUBLIC_CACHE_DB_TIMEOUT_MS = 10_000;

class PublicCacheDatabase extends PrismaClient {
  constructor() {
    const timeout = PUBLIC_CACHE_DB_TIMEOUT_MS;
    const pool = new DeadlinePool(
      {
        ...createPostgresPoolConfig(),
        application_name: 'lilink-public-cache',
        connectionTimeoutMillis: timeout,
        statement_timeout: timeout,
        idle_in_transaction_session_timeout: timeout,
      },
      timeout,
    );
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export function createPublicCacheDatabase() {
  return new PublicCacheDatabase();
}
