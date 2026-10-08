import { Client, Pool, type PoolClient, type PoolConfig } from 'pg';
import { performance } from 'node:perf_hooks';

type CheckoutCallback = Parameters<Pool['connect']>[0];

// A checkout's deadline includes pool acquisition and every statement in a
// transaction. Expiration removes and ends the actual client, freeing sockets
// and rejecting active queries even when PostgreSQL cannot respond.
export class DeadlinePool extends Pool {
  constructor(
    config: PoolConfig,
    private readonly deadlineMs: number,
  ) {
    super(config);
  }
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
        Math.max(1, this.deadlineMs - (performance.now() - started)),
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
            : new Error('Database checkout failed.'),
          undefined,
          () => {},
        ),
    );
  }
}
