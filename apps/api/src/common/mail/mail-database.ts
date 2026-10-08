import { PrismaPg } from '@prisma/adapter-pg';
import { DeadlinePool } from '../prisma/deadline-pool';
import { createPostgresPoolConfig, PrismaClient } from '../prisma/client';
import { env } from '../../config/env';

export const MAIL_DATABASE = Symbol('MAIL_DATABASE');

class MailDatabase extends PrismaClient {
  constructor() {
    const timeout = env.OUTBOUND_EMAIL_DB_TIMEOUT_MS;
    const pool = new DeadlinePool(
      {
        ...createPostgresPoolConfig(),
        max: env.SMTP_SEND_CONCURRENCY + 1,
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

export function createMailDatabase() {
  return new MailDatabase();
}
