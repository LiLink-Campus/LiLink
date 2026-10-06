import { Logger } from '@nestjs/common';
import { env, isLocalDevRuntime } from '../../config/env';
import { Prisma, type PrismaClient } from '../prisma/client';
import {
  cancelMatchEmails,
  canSendMatchEmail,
  matchIdFromEmailKey,
} from './match-mail';
import type { OutboundEmailRecord } from './mail-content';
import { MailSendGate } from './mail-send-gate';
import { MailTransport } from './mail-transport';

export const STALE_PROCESSING_MS = 10 * 60_000;
export const FLUSH_GRACE_MS = 15 * 60_000;
type DeliveryResult =
  | 'processed'
  | 'claimed-by-another-worker'
  | 'not-eligible';

export class MailDelivery {
  private readonly gate = new MailSendGate(env.SMTP_SEND_CONCURRENCY);
  private readonly transport = new MailTransport();
  private readonly logger = new Logger('MailService');

  constructor(
    private readonly prisma: PrismaClient,
    private readonly extendWindow: (until: number) => void,
  ) {}

  close() {
    this.transport.close();
  }

  process(email: OutboundEmailRecord): Promise<DeliveryResult> {
    return this.gate.run(() => this.withSlot(email), 'not-eligible');
  }

  private async withSlot(
    snapshot: OutboundEmailRecord,
  ): Promise<DeliveryResult> {
    if (!env.MAIL_DELIVERY_ENABLED || env.RELEASE_MAINTENANCE)
      return 'not-eligible';
    let claimedAt = new Date(Date.now());
    let result: DeliveryResult = 'not-eligible';
    const email = await this.prisma.$transaction(
      async (tx) => {
        const matchId = matchIdFromEmailKey(snapshot.dedupeKey);
        // Preserve Match -> outbox lock ordering used by report/reset cancellation.
        if (matchId)
          await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${matchId} FOR UPDATE`;
        const verification =
          snapshot.dedupeKey.startsWith('verification-code:');
        if (verification)
          await tx.$queryRaw`SELECT "id" FROM "EmailCode" WHERE "deliveryDedupeKey" = ${snapshot.dedupeKey} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "OutboundEmail" WHERE "id" = ${snapshot.id} FOR UPDATE`;
        const current = await tx.outboundEmail.findUnique({
          where: { id: snapshot.id },
        });
        if (!current) return null;
        claimedAt = new Date(Date.now());
        const due = this.dueWhere(current, claimedAt);
        if (!due) {
          result =
            current.status === 'PROCESSING'
              ? 'claimed-by-another-worker'
              : 'not-eligible';
          return null;
        }
        const cas = {
          ...due,
          attempts: current.attempts,
          maxAttempts: current.maxAttempts,
        };
        let reason: string | null =
          current.attempts >= current.maxAttempts
            ? 'Email delivery attempt budget exhausted.'
            : null;
        if (current.dedupeKey.startsWith('meetup-reminder:'))
          reason = 'Meetup workflow retired before delivery.';
        if (
          matchId &&
          !(await canSendMatchEmail(tx, matchId, current.recipientEmail))
        ) {
          await cancelMatchEmails(
            tx,
            [matchId],
            'Match unavailable before delivery.',
          );
          return null;
        }
        if (
          verification &&
          !(await this.validCode(tx, current.dedupeKey, claimedAt))
        )
          reason = 'Verification code unavailable before delivery.';
        if (reason) {
          const ended = await tx.outboundEmail.updateMany({
            where: cas,
            data: {
              status: 'EXHAUSTED',
              nextAttemptAt: null,
              errorMessage: reason,
            },
          });
          if (ended.count && verification)
            await tx.emailCode.updateMany({
              where: { deliveryDedupeKey: current.dedupeKey },
              data: { deliveryStatus: 'EXHAUSTED' },
            });
          return null;
        }
        // Exact persisted values guard concurrent budget edits and competing
        // claims; stale reclamation obeys the same remaining-budget predicate.
        // Verification expiry is rechecked in the actual UPDATE after any
        // outbox row-lock wait, using database time as well as API time.
        claimedAt = new Date(Date.now());
        const claimed = verification
          ? {
              count: await tx.$executeRaw`
              UPDATE "OutboundEmail"
              SET "status" = 'PROCESSING', "attempts" = "attempts" + 1,
                  "lastAttemptAt" = ${claimedAt}, "updatedAt" = ${claimedAt}, "errorMessage" = NULL
              WHERE "id" = ${current.id} AND "status"::text = ${current.status}
                AND "attempts" = ${current.attempts} AND "maxAttempts" = ${current.maxAttempts}
                AND "attempts" < "maxAttempts"
                AND ("status" = 'PENDING'
                  OR ("status" = 'FAILED' AND "nextAttemptAt" <= ${claimedAt})
                  OR ("status" = 'PROCESSING' AND "lastAttemptAt" < ${new Date(claimedAt.getTime() - STALE_PROCESSING_MS)}))
                AND EXISTS (
                  SELECT 1 FROM "EmailCode" c
                  WHERE c."deliveryDedupeKey" = ${current.dedupeKey}
                    AND c."email" = ${current.recipientEmail} AND c."consumedAt" IS NULL
                    AND c."expiresAt" > GREATEST(clock_timestamp(), ${claimedAt}::timestamptz)
                    AND NOT EXISTS (
                      SELECT 1 FROM "EmailCode" newer WHERE newer."email" = c."email"
                        AND newer."purpose" = c."purpose" AND newer."createdAt" > c."createdAt"
                    )
                )
            `,
            }
          : await tx.outboundEmail.updateMany({
              where: cas,
              data: {
                status: 'PROCESSING',
                attempts: { increment: 1 },
                lastAttemptAt: claimedAt,
                errorMessage: null,
              },
            });
        if (!claimed.count) {
          if (verification) {
            const ended = await tx.outboundEmail.updateMany({
              where: cas,
              data: {
                status: 'EXHAUSTED',
                nextAttemptAt: null,
                errorMessage:
                  'Verification code unavailable at delivery claim.',
              },
            });
            if (ended.count) {
              await tx.emailCode.updateMany({
                where: { deliveryDedupeKey: current.dedupeKey },
                data: { deliveryStatus: 'EXHAUSTED' },
              });
              return null;
            }
          }
          result = 'claimed-by-another-worker';
          return null;
        }
        return { ...current, attempts: current.attempts + 1 };
      },
      {
        maxWait: env.OUTBOUND_EMAIL_DB_TIMEOUT_MS,
        timeout: env.OUTBOUND_EMAIL_DB_TIMEOUT_MS,
      },
    );
    if (!email) return result;
    this.extendWindow(
      claimedAt.getTime() + STALE_PROCESSING_MS + FLUSH_GRACE_MS,
    );
    const lease = {
      id: email.id,
      status: 'PROCESSING' as const,
      lastAttemptAt: claimedAt,
      attempts: email.attempts,
    };
    try {
      await this.transport.send(email);
      const sentAt = new Date(Date.now());
      const completed = await this.prisma.outboundEmail.updateMany({
        where: lease,
        data: {
          status: 'SENT',
          sentAt,
          nextAttemptAt: null,
          errorMessage: null,
        },
      });
      if (completed.count)
        await this.syncCode(email.dedupeKey, {
          deliveryStatus: 'SENT',
          sentAt,
        });
    } catch {
      const exhausted = email.attempts >= email.maxAttempts;
      const nextAttemptAt = exhausted
        ? null
        : new Date(Date.now() + email.attempts * 60_000);
      // Transport and database errors may include recipients or SMTP payloads.
      const completed = await this.prisma.outboundEmail.updateMany({
        where: lease,
        data: {
          status: exhausted ? 'EXHAUSTED' : 'FAILED',
          nextAttemptAt,
          errorMessage: 'Email delivery or completion failed.',
        },
      });
      if (!completed.count) return 'processed';
      if (nextAttemptAt)
        this.extendWindow(nextAttemptAt.getTime() + FLUSH_GRACE_MS);
      const fallback = this.printLocalFallback(email);
      await this.syncCode(email.dedupeKey, {
        deliveryStatus: fallback ? 'SENT' : exhausted ? 'EXHAUSTED' : 'FAILED',
        sentAt: fallback ? new Date(Date.now()) : undefined,
      });
      this.logger.warn(
        'Email delivery or completion failed; persisted retry budget applied.',
      );
    }
    return 'processed';
  }

  private dueWhere(
    email: OutboundEmailRecord,
    now: Date,
  ): Prisma.OutboundEmailWhereInput | null {
    if (email.status === 'PENDING') return { id: email.id, status: 'PENDING' };
    if (
      email.status === 'FAILED' &&
      email.nextAttemptAt &&
      email.nextAttemptAt <= now
    )
      return {
        id: email.id,
        status: 'FAILED',
        nextAttemptAt: { lte: now },
      };
    if (
      email.status === 'PROCESSING' &&
      email.lastAttemptAt &&
      email.lastAttemptAt.getTime() < now.getTime() - STALE_PROCESSING_MS
    )
      return {
        id: email.id,
        status: 'PROCESSING',
        lastAttemptAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) },
      };
    return null;
  }

  private async validCode(
    tx: Prisma.TransactionClient,
    key: string,
    now: Date,
  ) {
    const code = await tx.emailCode.findUnique({
      where: { deliveryDedupeKey: key },
    });
    if (!code || code.consumedAt || code.expiresAt <= now) return false;
    const latest = await tx.emailCode.findFirst({
      where: { email: code.email, purpose: code.purpose },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest?.id === code.id;
  }

  private async syncCode(
    key: string,
    data: { deliveryStatus: 'SENT' | 'FAILED' | 'EXHAUSTED'; sentAt?: Date },
  ) {
    if (!key.startsWith('verification-code:')) return;
    await this.prisma.emailCode.updateMany({
      where: {
        deliveryDedupeKey: key,
        consumedAt: null,
        expiresAt: { gt: new Date(Date.now()) },
        deliveryStatus: { not: 'EXHAUSTED' },
      },
      data,
    });
  }

  private printLocalFallback(email: OutboundEmailRecord) {
    if (
      !isLocalDevRuntime() ||
      !email.dedupeKey.startsWith('verification-code:')
    )
      return false;
    const code = [email.subject, email.text ?? '', email.html]
      .map((part) => part.match(/\b\d{6}\b/)?.[0])
      .find(Boolean);
    if (!code) return false;
    process.stdout.write(
      `[LOCAL DEV OVERRIDE] 邮箱: ${email.recipientEmail} 验证码: ${code}\n`,
    );
    return true;
  }
}
