import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool, type PoolClient } from 'pg';
import { performance } from 'node:perf_hooks';
import { createPostgresPoolConfig, PrismaClient } from '../prisma/client';
import { env } from '../../config/env';

export const MAIL_DATABASE = Symbol('MAIL_DATABASE');
type CheckoutCallback = Parameters<Pool['connect']>[0];

// A checkout's deadline includes pool acquisition and every statement in a
// transaction. Expiration removes and ends the actual client, freeing sockets
// and rejecting active queries even when PostgreSQL cannot respond.
class MailPool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(callback: CheckoutCallback): void;
  override connect(callback?: CheckoutCallback): Promise<PoolClient> | void {
    const acquire = async () => {
      const started = performance.now();
      const client = await super.connect();
      const release = client.release.bind(client);
      let released = false;
      const timer = setTimeout(
        () => {
          (client as PoolClient & Client).connection.stream.destroy();
          client.release(true);
        },
        Math.max(
          1,
          env.OUTBOUND_EMAIL_DB_TIMEOUT_MS - (performance.now() - started),
        ),
      );
      client.release = (error?: Error | boolean) => {
        if (released) return;
        released = true;
        clearTimeout(timer);
        release(error);
      };
      return client;
    };
    if (!callback) return acquire();
    void acquire().then(
      (client) => callback(undefined, client, client.release.bind(client)),
      (error: unknown) =>
        callback(
          error instanceof Error
            ? error
            : new Error('Mail database checkout failed.'),
          undefined,
          () => {},
        ),
    );
  }
}

class MailDatabase extends PrismaClient {
  constructor() {
    const timeout = env.OUTBOUND_EMAIL_DB_TIMEOUT_MS;
    const pool = new MailPool({
      ...createPostgresPoolConfig(),
      max: env.SMTP_SEND_CONCURRENCY + 1,
      connectionTimeoutMillis: timeout,
      statement_timeout: timeout,
      idle_in_transaction_session_timeout: timeout,
    });
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export function createMailDatabase() {
  return new MailDatabase();
}
