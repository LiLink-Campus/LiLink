import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { env } from '../../config/env';
import { performance } from 'node:perf_hooks';
import type { PrismaService } from '../prisma/prisma.service';
import { MailContent } from './mail-content';
import {
  MailDelivery,
  FLUSH_GRACE_MS,
  STALE_PROCESSING_MS,
} from './mail-delivery';
import { MAIL_DATABASE } from './mail-database';
import { nextIdleDeadline } from '../idle-deadline';

@Injectable()
export class MailService extends MailContent {
  private readonly logger = new Logger(MailService.name);
  private isFlushing = false;
  private stopped = false;
  private flushPollUntil = Date.now() + FLUSH_GRACE_MS;
  private nextFallbackAt = nextIdleDeadline(
    Date.now(),
    env.OUTBOUND_EMAIL_IDLE_POLL_MS,
  );
  private nextScanRetryAt = 0;
  private consecutiveFailures = 0;
  private firstScanFailureAt: number | null = null;
  private lastSuccessfulScanAt: number | null = null;
  private backlogSample: {
    sampledAt: number;
    candidateCount: number;
    oldestCandidateAgeMs: number | null;
    truncated: boolean;
  } | null = null;
  private readonly delivery: MailDelivery;

  constructor(@Inject(MAIL_DATABASE) private readonly prisma: PrismaService) {
    super();
    this.delivery = new MailDelivery(prisma, (until) =>
      this.extendFlushWindow(until),
    );
  }

  onModuleDestroy() {
    this.stopped = true;
    this.delivery.close();
  }

  // Diagnostic state reuses the bounded candidate scan. A failed scan clears
  // the sample to UNKNOWN rather than reporting an empty queue.
  getQueueHealth() {
    return {
      flushPollUntil: this.flushPollUntil,
      consecutiveFailures: this.consecutiveFailures,
      firstScanFailureAt: this.firstScanFailureAt,
      lastSuccessfulScanAt: this.lastSuccessfulScanAt,
      nextFallbackAt: this.nextFallbackAt,
      nextScanRetryAt: this.nextScanRetryAt,
      backlogSample: this.backlogSample,
    };
  }

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'outbound-email-flush',
    waitForCompletion: true,
  })
  async handleEmailQueue() {
    if (
      this.stopped ||
      !env.BACKGROUND_JOBS_ENABLED ||
      !env.MAIL_DELIVERY_ENABLED ||
      env.RELEASE_MAINTENANCE
    )
      return;
    const now = Date.now();
    if (
      now < this.nextScanRetryAt ||
      (now > this.flushPollUntil && now < this.nextFallbackAt)
    )
      return;
    try {
      const scanned = await this.flushQueuedEmails();
      if (scanned && now >= this.nextFallbackAt)
        this.nextFallbackAt = nextIdleDeadline(
          now,
          env.OUTBOUND_EMAIL_IDLE_POLL_MS,
        );
    } catch {
      this.consecutiveFailures++;
      this.firstScanFailureAt ??= now;
      this.backlogSample = null;
      this.nextScanRetryAt =
        Date.now() +
        Math.min(
          env.OUTBOUND_EMAIL_SCAN_BACKOFF_MAX_MS,
          60_000 * 2 ** Math.min(this.consecutiveFailures - 1, 20),
        );
      this.logger.warn({
        message: 'Outbound email scan failed.',
        ...this.getQueueHealth(),
        failureDurationMs: Date.now() - this.firstScanFailureAt,
      });
    }
  }

  private extendFlushWindow(until: number) {
    this.flushPollUntil = Math.max(until, this.flushPollUntil);
  }

  async flushQueuedEmails(
    options: { dedupeKeys?: string[]; limit?: number } = {},
  ): Promise<boolean | undefined> {
    if (this.stopped || !env.MAIL_DELIVERY_ENABLED || env.RELEASE_MAINTENANCE)
      return;
    if (options.dedupeKeys?.length)
      this.extendFlushWindow(Date.now() + FLUSH_GRACE_MS);
    if (this.isFlushing) return;
    this.isFlushing = true;
    try {
      const now = new Date(Date.now());
      const limit = Math.min(
        options.dedupeKeys?.length ??
          options.limit ??
          env.OUTBOUND_EMAIL_FLUSH_BATCH_SIZE,
        env.OUTBOUND_EMAIL_FLUSH_BATCH_SIZE,
      );
      const queued = await this.prisma.outboundEmail.findMany({
        where: {
          ...(options.dedupeKeys
            ? { dedupeKey: { in: options.dedupeKeys } }
            : {}),
          OR: [
            { status: 'PENDING' },
            { status: 'FAILED', nextAttemptAt: { lte: now } },
            {
              status: 'PROCESSING',
              lastAttemptAt: {
                lt: new Date(now.getTime() - STALE_PROCESSING_MS),
              },
            },
          ],
        },
        orderBy: [{ messageCategory: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });
      if (queued.length) this.extendFlushWindow(Date.now() + FLUSH_GRACE_MS);
      this.lastSuccessfulScanAt = Date.now();
      this.consecutiveFailures = 0;
      this.firstScanFailureAt = null;
      this.nextScanRetryAt = 0;
      this.backlogSample = {
        sampledAt: Date.now(),
        candidateCount: queued.length,
        oldestCandidateAgeMs: queued.length
          ? Math.max(
              ...queued.map((row) =>
                Math.max(0, now.getTime() - row.createdAt.getTime()),
              ),
            )
          : null,
        truncated: queued.length === limit,
      };
      // Keep ownership until all workers release their bounded slots, including
      // rejection paths; Promise.all would unlock on the first rejected worker.
      const results = await Promise.allSettled(
        queued.map((email) => this.delivery.process(email)),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') {
        this.logger.warn(
          'An outbound email worker failed after the successful candidate scan; a later scan will recover it.',
        );
      }
      this.logger.log({
        message: 'Outbound email scan completed.',
        ...this.getQueueHealth(),
      });
      return true;
    } finally {
      this.isFlushing = false;
    }
  }

  async deliverQueuedEmailNow(dedupeKey: string) {
    this.extendFlushWindow(Date.now() + FLUSH_GRACE_MS);
    const email = await this.prisma.outboundEmail.findUnique({
      where: { dedupeKey },
    });
    if (!email || email.status === 'SENT' || email.status === 'EXHAUSTED')
      return email;
    if ((await this.delivery.process(email)) === 'claimed-by-another-worker')
      return this.waitForCompletion(dedupeKey);
    return this.prisma.outboundEmail.findUnique({ where: { dedupeKey } });
  }

  private async waitForCompletion(dedupeKey: string) {
    const deadline = performance.now() + 15_000;
    for (;;) {
      const email = await this.prisma.outboundEmail.findUnique({
        where: { dedupeKey },
      });
      if (
        !email ||
        email.status !== 'PROCESSING' ||
        performance.now() >= deadline
      )
        return email;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}
