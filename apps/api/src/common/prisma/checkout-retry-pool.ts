import { setTimeout } from 'node:timers/promises';
import { Pool, type PoolClient } from 'pg';

type CheckoutCallback = Parameters<Pool['connect']>[0];

function isTransientCheckoutError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return (
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    message === 'Connection terminated unexpectedly'
  );
}

export class CheckoutRetryPool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(callback: CheckoutCallback): void;
  override connect(callback?: CheckoutCallback): Promise<PoolClient> | void {
    const acquire = async () => {
      try {
        return await super.connect();
      } catch (error) {
        if (this.ending || !isTransientCheckoutError(error)) throw error;
        // No client was checked out, so no SQL or transaction has started.
        await setTimeout(100);
        return super.connect();
      }
    };
    if (!callback) return acquire();
    void acquire().then(
      (client) =>
        callback(undefined, client, (error?: Error | boolean) =>
          client.release(error),
        ),
      (error: unknown) =>
        callback(
          error instanceof Error ? error : new Error(String(error)),
          undefined,
          () => {},
        ),
    );
  }
}
