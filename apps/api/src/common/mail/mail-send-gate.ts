import { env } from '../../config/env';

export class MailSendGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(work: () => Promise<T>, expired: T): Promise<T> {
    if (!(await this.acquire())) return expired;
    try {
      return await work();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  private acquire(): Promise<boolean> {
    if (this.active < this.concurrency) {
      this.active++;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const next = () => {
        clearTimeout(timer);
        this.active++;
        resolve(true);
      };
      const timer = setTimeout(() => {
        const index = this.queue.indexOf(next);
        if (index >= 0) this.queue.splice(index, 1);
        resolve(false);
      }, env.OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS);
      this.queue.push(next);
    });
  }
}
