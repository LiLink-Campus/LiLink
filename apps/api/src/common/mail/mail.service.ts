import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type IntroductionEmailInput = {
  matchId: string;
  requester: {
    email: string;
    displayName: string | null;
    schoolName?: string | null;
    introLine?: string | null;
  };
  recipient: {
    email: string;
    displayName: string | null;
    schoolName?: string | null;
    introLine?: string | null;
  };
  reasons: string[];
};

type VerificationCodeEmailInput = {
  dedupeKey: string;
  recipientEmail: string;
  code: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private isFlushing = false;

  constructor(private readonly prisma: PrismaService) {}
  private readonly transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });

  buildVerificationCodeEmail(input: VerificationCodeEmailInput) {
    return {
      dedupeKey: input.dedupeKey,
      recipientEmail: input.recipientEmail,
      subject: 'LiLink verification code',
      html: `<p>Your LiLink verification code is <strong>${input.code}</strong>. It expires in 10 minutes.</p>`,
      maxAttempts: 1,
    };
  }

  buildIntroductionEmails(input: IntroductionEmailInput) {
    const requesterName = input.requester.displayName ?? 'LiLink 用户';
    const recipientName = input.recipient.displayName ?? 'LiLink 用户';
    const escapedRequesterName = escapeHtml(requesterName);
    const escapedRecipientName = escapeHtml(recipientName);
    const reasons = input.reasons
      .map((reason) => `<li>${escapeHtml(reason)}</li>`)
      .join('');

    return [
      {
        dedupeKey: `match-introduction:${input.matchId}:requester`,
        recipientEmail: input.requester.email,
        subject: `LiLink 已为你引荐 ${recipientName}`,
        html: `
          <p>你已成功请求联系 <strong>${escapedRecipientName}</strong>。</p>
          <p>对方邮箱：<strong>${escapeHtml(input.recipient.email)}</strong></p>
          <p>对方学校：${escapeHtml(input.recipient.schoolName ?? '未填写')}</p>
          <p>对方一句话介绍：${escapeHtml(input.recipient.introLine ?? '暂无')}</p>
          <p>本次匹配理由：</p>
          <ul>${reasons}</ul>
        `,
      },
      {
        dedupeKey: `match-introduction:${input.matchId}:recipient`,
        recipientEmail: input.recipient.email,
        subject: `LiLink 已为你引荐 ${requesterName}`,
        html: `
          <p><strong>${escapedRequesterName}</strong> 请求与你建立联系。</p>
          <p>对方邮箱：<strong>${escapeHtml(input.requester.email)}</strong></p>
          <p>对方学校：${escapeHtml(input.requester.schoolName ?? '未填写')}</p>
          <p>对方一句话介绍：${escapeHtml(input.requester.introLine ?? '暂无')}</p>
          <p>本次匹配理由：</p>
          <ul>${reasons}</ul>
        `,
      },
    ];
  }

  @Cron(CronExpression.EVERY_30_SECONDS, {
    name: 'outbound-email-flush',
    waitForCompletion: true,
  })
  async handleEmailQueue() {
    await this.flushQueuedEmails();
  }

  async flushQueuedEmails(
    options: { dedupeKeys?: string[]; limit?: number } = {},
  ) {
    if (this.isFlushing) {
      return;
    }

    this.isFlushing = true;

    try {
      const now = new Date();
      const staleProcessingThreshold = new Date(now.getTime() - 10 * 60 * 1000);
      const queuedEmails = await this.prisma.outboundEmail.findMany({
        where: {
          ...(options.dedupeKeys
            ? {
                dedupeKey: {
                  in: options.dedupeKeys,
                },
              }
            : {}),
          OR: [
            { status: 'PENDING' },
            {
              status: 'FAILED',
              nextAttemptAt: { lte: now },
            },
            {
              status: 'PROCESSING',
              lastAttemptAt: { lt: staleProcessingThreshold },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: options.dedupeKeys?.length ?? options.limit ?? 10,
      });

      for (const queuedEmail of queuedEmails) {
        await this.processOutboundEmail(queuedEmail);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async processOutboundEmail(email: {
    id: string;
    dedupeKey: string;
    recipientEmail: string;
    subject: string;
    html: string;
    status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'EXHAUSTED';
    attempts: number;
    maxAttempts: number;
  }) {
    const claimedAt = new Date();
    const claimResult = await this.prisma.outboundEmail.updateMany({
      where: {
        id: email.id,
        status: {
          in: ['PENDING', 'FAILED', 'PROCESSING'],
        },
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: claimedAt,
        errorMessage: null,
      },
    });

    if (claimResult.count === 0) {
      return;
    }

    try {
      const sentAt = new Date();
      await this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: email.recipientEmail,
        subject: email.subject,
        html: email.html,
      });

      await this.prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: 'SENT',
          sentAt,
          nextAttemptAt: null,
          errorMessage: null,
        },
      });

      await this.syncVerificationCodeStatus(email.dedupeKey, {
        deliveryStatus: 'SENT',
        sentAt,
      });
    } catch (error) {
      const nextAttemptNumber = email.attempts + 1;
      const exhausted = nextAttemptNumber >= email.maxAttempts;
      const nextAttemptAt = exhausted
        ? null
        : new Date(Date.now() + nextAttemptNumber * 60 * 1000);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown email delivery error.';

      await this.prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: exhausted ? 'EXHAUSTED' : 'FAILED',
          nextAttemptAt,
          errorMessage,
        },
      });

      await this.syncVerificationCodeStatus(email.dedupeKey, {
        deliveryStatus: exhausted ? 'EXHAUSTED' : 'FAILED',
      });

      this.logger.warn(
        `Email delivery failed for ${email.dedupeKey}: ${errorMessage}`,
      );
    }
  }

  private async syncVerificationCodeStatus(
    dedupeKey: string,
    data: {
      deliveryStatus: 'SENT' | 'FAILED' | 'EXHAUSTED';
      sentAt?: Date | null;
    },
  ) {
    if (!dedupeKey.startsWith('verification-code:')) {
      return;
    }

    await this.prisma.emailCode.updateMany({
      where: {
        deliveryDedupeKey: dedupeKey,
      },
      data,
    });
  }
}
