import { Logger } from '@nestjs/common';
import { IDLE_POLL_MS, nextIdleDeadline } from '../../common/idle-deadline';

export type ScanResult<T> = { value: T; nextAt?: number };
const RETRY_MS = [60_000, 120_000, 240_000, 300_000];

// Shared only by the two durable public-cache workers. It owns timing and
// scan failures; the services own their persisted business state and budgets.
export class PublicCacheSchedule<T> {
  private readonly logger: Logger;
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private rerun = false;
  private stopped = false;
  private nextAt = 0;
  private failures = 0;
  private firstFailureAt: number | null = null;
  private recoveryAt = 0;
  private lastOutcome?: T;
  private state: 'healthy' | 'unknown' | 'degraded' = 'healthy';

  constructor(
    name: string,
    private readonly enabled: () => boolean,
    private readonly scan: () => Promise<ScanResult<T>>,
  ) {
    this.logger = new Logger(name);
  }

  health() {
    return {
      state: this.state,
      outcome: this.lastOutcome,
      consecutiveFailures: this.failures,
      firstFailureAt: this.firstFailureAt,
      nextRecoveryAt: this.recoveryAt || null,
      nextRunAt: this.nextAt || null,
      running: this.running,
    };
  }

  active() {
    return !this.stopped && this.enabled();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.nextAt = 0;
  }

  wake() {
    if (!this.active()) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.arm(this.recoveryAt || Date.now());
  }

  async run(force = false): Promise<T | undefined> {
    if (!this.active()) return;
    if (this.running) {
      if (force) this.rerun = true;
      return;
    }
    const now = Date.now();
    if (now < this.recoveryAt) {
      this.arm(this.recoveryAt);
      return;
    }
    if (!force && now < this.nextAt) return;
    clearTimeout(this.timer);
    this.nextAt = 0;
    this.running = true;
    this.rerun = false;
    try {
      const result = await this.scan();
      this.lastOutcome = result.value;
      if (this.failures)
        this.logger.log('Public cache database scan recovered.');
      this.failures = 0;
      this.firstFailureAt = null;
      this.recoveryAt = 0;
      this.state = 'healthy';
      const nextAt = Math.min(
        result.nextAt ?? Infinity,
        nextIdleDeadline(Date.now()),
      );
      this.arm(this.rerun ? Date.now() : nextAt);
      return result.value;
    } catch {
      this.failures++;
      this.firstFailureAt ??= Date.now();
      this.state = this.failures >= 5 ? 'degraded' : 'unknown';
      this.recoveryAt =
        Date.now() + (RETRY_MS[this.failures - 1] ?? IDLE_POLL_MS);
      // Neither exception text nor unknown queue length is emitted.
      this.logger.warn({
        message: 'Public cache database scan failed.',
        ...this.health(),
      });
      this.arm(this.recoveryAt);
      return undefined;
    } finally {
      this.running = false;
    }
  }

  private arm(at: number) {
    if (!this.active()) return;
    const next = Math.max(Date.now() + 25, at);
    if (this.nextAt && this.nextAt <= next) return;
    clearTimeout(this.timer);
    this.nextAt = next;
    this.timer = setTimeout(
      () => {
        this.nextAt = 0;
        void this.run();
      },
      Math.max(1, next - Date.now()),
    );
    this.timer.unref();
  }
}
