import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboundEmailMessageCategory } from '../prisma/client';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import {
  WEEKLY_INTENT_LABELS,
  type ContactChannelType,
  type WeeklyIntent,
} from '@lilink/shared';

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

type IntroductionEmailParty = {
  email: string;
  displayName: string | null;
  schoolName?: string | null;
  introLine?: string | null;
  publicContact?: PublicContactInput;
  gender?: string | null;
  partnerGenders?: string[];
  weeklyIntent?: WeeklyIntent | null;
};

type IntroductionEmailInput = {
  matchId: string;
  requester: IntroductionEmailParty;
  recipient: IntroductionEmailParty;
};

type PublicContactInput = {
  type: ContactChannelType;
  label: string;
  value: string;
};

type VerificationCodeEmailInput = {
  dedupeKey: string;
  recipientEmail: string;
  code: string;
};

type MeetupReminderEmailInput = {
  sessionId: string;
  recipientEmail: string;
  recipientDisplayName: string | null;
  otherPartyDisplayName: string | null;
  actionSentence: string;
  directUrl: string;
};

type OutboundEmailRecord = {
  id: string;
  dedupeKey: string;
  recipientEmail: string;
  subject: string;
  html: string;
  text: string | null;
  messageCategory: OutboundEmailMessageCategory;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'EXHAUSTED';
  attempts: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
};

// Headers applied to every outbound message. They mark the mail as
// auto-generated transactional traffic so receiving anti-spam systems are
// less likely to bucket it with bulk/marketing or reply with auto-responses.
const TRANSACTIONAL_EMAIL_HEADERS = {
  'Auto-Submitted': 'auto-generated',
  'X-Auto-Response-Suppress': 'All',
  'X-Entity-Ref-ID': 'lilink-transactional',
} as const;

function resolveSmtpFromForCategory(
  category: OutboundEmailMessageCategory,
): string {
  if (category === OutboundEmailMessageCategory.BULK) {
    return env.SMTP_FROM_BULK.trim() || env.SMTP_FROM;
  }
  return env.SMTP_FROM_TRANSACTIONAL.trim() || env.SMTP_FROM;
}

function buildSendHeaders(
  category: OutboundEmailMessageCategory,
): Record<string, string> {
  if (category === OutboundEmailMessageCategory.BULK) {
    const headers: Record<string, string> = {
      'Content-Language': 'zh-CN',
      'X-Entity-Ref-ID': 'lilink-bulk',
    };
    if (env.MAIL_LIST_UNSUBSCRIBE_URL.length > 0) {
      headers['List-Unsubscribe'] = `<${env.MAIL_LIST_UNSUBSCRIBE_URL}>`;
    }
    return headers;
  }
  return {
    ...TRANSACTIONAL_EMAIL_HEADERS,
    'Content-Language': 'zh-CN',
  };
}

const HTML_DOCUMENT_STYLES = `
  body{margin:0;padding:24px;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;line-height:1.6;}
  .card{max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;}
  .brand{margin:0 0 16px;font-size:14px;color:#6e6e73;letter-spacing:1px;}
  h1{margin:0 0 24px;font-size:18px;color:#1d1d1f;}
  p{margin:0 0 16px;font-size:15px;color:#1d1d1f;}
  .code{margin:0 0 24px;font-size:28px;font-weight:600;letter-spacing:6px;color:#1d1d1f;text-align:center;padding:16px;background:#f5f5f7;border-radius:8px;}
  .note{font-size:14px;color:#3a3a3c;}
  hr{margin:24px 0;border:none;border-top:1px solid #e5e5ea;}
  .footer{margin:0;font-size:12px;color:#86868b;}
  .footer a{color:#0071e3;text-decoration:none;}
  ul{padding-left:20px;}
`.replace(/\s+/g, ' ');

function renderHtmlDocument(input: { title: string; body: string }) {
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${HTML_DOCUMENT_STYLES}</style>`,
    '</head>',
    '<body>',
    `<div class="card">${input.body}</div>`,
    '</body>',
    '</html>',
  ].join('');
}

const OUTBOUND_EMAIL_STALE_PROCESSING_MS = 10 * 60 * 1000;
const OUTBOUND_EMAIL_SYNC_WAIT_TIMEOUT_MS = 15_000;
const OUTBOUND_EMAIL_SYNC_WAIT_INTERVAL_MS = 50;

class AsyncConcurrencyGate {
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number) {}

  async run<T>(work: () => Promise<T>) {
    await this.acquire();

    try {
      return await work();
    } finally {
      this.release();
    }
  }

  private acquire() {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCount += 1;
        resolve();
      });
    });
  }

  private release() {
    this.activeCount -= 1;

    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private isFlushing = false;
  private readonly sendGate = new AsyncConcurrencyGate(
    env.SMTP_SEND_CONCURRENCY,
  );

  constructor(private readonly prisma: PrismaService) {}
  private readonly transporter = nodemailer.createTransport({
    pool: true,
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    maxConnections: env.SMTP_MAX_CONNECTIONS,
    maxMessages: env.SMTP_MAX_MESSAGES,
    connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
  });

  buildVerificationCodeEmail(input: VerificationCodeEmailInput) {
    const subject = `LiLink 验证码 ${input.code}`;
    const text = [
      '你好，',
      '',
      `你正在使用 LiLink，本次操作的验证码是：${input.code}`,
      '',
      '验证码有效期 10 分钟，请勿向任何人透露。',
      '如果这不是你本人的操作，请忽略本邮件，无需任何操作。',
      '',
      '此邮件由 LiLink 系统自动发送，请勿直接回复。',
      '',
      '— LiLink 团队',
      'https://lilink.top',
    ].join('\n');
    const html = renderHtmlDocument({
      title: subject,
      body: [
        '<p class="brand">LiLink</p>',
        '<h1>你的验证码</h1>',
        '<p>你正在使用 LiLink，本次操作的验证码是：</p>',
        `<p class="code">${escapeHtml(input.code)}</p>`,
        '<p class="note">验证码有效期 10 分钟，请勿向任何人透露。</p>',
        '<p class="note">如果这不是你本人的操作，请忽略本邮件，无需任何操作。</p>',
        '<p class="footer">此邮件由 LiLink 系统自动发送，请勿直接回复。</p>',
        '<hr>',
        '<p class="footer">— LiLink 团队 · <a href="https://lilink.top">lilink.top</a></p>',
      ].join(''),
    });

    return {
      dedupeKey: input.dedupeKey,
      recipientEmail: input.recipientEmail,
      subject,
      html,
      text,
      messageCategory: OutboundEmailMessageCategory.TRANSACTIONAL,
      // Total retry budget ~3 min (60s + 120s back-off), well below the 10-min
      // verification-code TTL. Buffers transient SMTP/upstream hiccups.
      maxAttempts: 3,
    };
  }

  buildIntroductionEmails(input: IntroductionEmailInput) {
    const requesterName = input.requester.displayName ?? 'LiLink 用户';
    const recipientName = input.recipient.displayName ?? 'LiLink 用户';

    return [
      this.buildIntroductionEmail({
        dedupeKey: `match-introduction:${input.matchId}:requester`,
        recipientEmail: input.requester.email,
        otherParty: input.recipient,
        otherPartyDisplayName: recipientName,
        leadingSentence: `你已成功请求联系 ${recipientName}。`,
      }),
      this.buildIntroductionEmail({
        dedupeKey: `match-introduction:${input.matchId}:recipient`,
        recipientEmail: input.recipient.email,
        otherParty: input.requester,
        otherPartyDisplayName: requesterName,
        leadingSentence: `${requesterName} 请求与你建立联系。`,
      }),
    ];
  }

  buildMeetupReminderEmail(input: MeetupReminderEmailInput) {
    const recipientName = input.recipientDisplayName ?? 'LiLink 用户';
    const subject = 'LiLink 破冰会话待处理';
    const text = [
      `${recipientName}，`,
      '',
      input.actionSentence,
      '请打开 LiLink 查看并处理这个破冰会话：',
      input.directUrl,
      '',
      '每个破冰会话最多发送一次提醒邮件。此邮件由 LiLink 系统自动发送，请勿直接回复。',
      '',
      '— LiLink 团队',
      'https://lilink.top',
    ].join('\n');
    const html = renderHtmlDocument({
      title: subject,
      body: [
        '<p class="brand">LiLink</p>',
        `<h1>${escapeHtml(subject)}</h1>`,
        `<p>${escapeHtml(recipientName)}，</p>`,
        `<p>${escapeHtml(input.actionSentence)}</p>`,
        `<p><a href="${escapeHtml(input.directUrl)}">打开 LiLink 处理破冰会话</a></p>`,
        '<p class="footer">每个破冰会话最多发送一次提醒邮件。此邮件由 LiLink 系统自动发送，请勿直接回复。</p>',
        '<hr>',
        '<p class="footer">— LiLink 团队 · <a href="https://lilink.top">lilink.top</a></p>',
      ].join(''),
    });

    return {
      dedupeKey: `meetup-reminder:${input.sessionId}`,
      recipientEmail: input.recipientEmail,
      subject,
      html,
      text,
      messageCategory: OutboundEmailMessageCategory.TRANSACTIONAL,
    };
  }

  private buildIntroductionEmail(input: {
    dedupeKey: string;
    recipientEmail: string;
    otherParty: IntroductionEmailParty;
    otherPartyDisplayName: string;
    leadingSentence: string;
  }) {
    const subject = `LiLink 已为你引荐 ${input.otherPartyDisplayName}`;
    const otherContact = input.otherParty.publicContact ?? {
      type: 'EMAIL' as const,
      label: '邮箱',
      value: input.otherParty.email,
    };
    const otherContactText = `${otherContact.label} ${otherContact.value}`;
    const otherSchool = input.otherParty.schoolName ?? '未填写';
    const otherIntro = input.otherParty.introLine ?? '暂无';
    const otherGender = input.otherParty.gender?.trim() || null;
    const otherPartnerGenders = (input.otherParty.partnerGenders ?? []).filter(
      (gender) => gender.trim().length > 0,
    );
    const otherWeeklyIntentLabel = input.otherParty.weeklyIntent
      ? WEEKLY_INTENT_LABELS[input.otherParty.weeklyIntent].subtitle
      : null;

    const infoLines: string[] = [];
    if (otherGender) {
      infoLines.push(`对方性别：${otherGender}`);
    }
    if (otherPartnerGenders.length > 0) {
      infoLines.push(`对方期望对象性别：${otherPartnerGenders.join('、')}`);
    }
    if (otherWeeklyIntentLabel) {
      infoLines.push(`对方本周意向：${otherWeeklyIntentLabel}`);
    }

    const text = [
      input.leadingSentence,
      '',
      `对方联系方式：${otherContactText}`,
      `对方学校：${otherSchool}`,
      `对方一句话介绍：${otherIntro}`,
      ...infoLines,
      '',
      '此邮件由 LiLink 系统自动发送，请勿直接回复。',
      '',
      '— LiLink 团队',
      'https://lilink.top',
    ].join('\n');

    const infoHtml = infoLines
      .map((line) => `<p class="note">${escapeHtml(line)}</p>`)
      .join('');

    const html = renderHtmlDocument({
      title: subject,
      body: [
        '<p class="brand">LiLink</p>',
        `<h1>${escapeHtml(subject)}</h1>`,
        `<p>${escapeHtml(input.leadingSentence)}</p>`,
        `<p class="note">对方联系方式：<strong>${escapeHtml(otherContactText)}</strong></p>`,
        `<p class="note">对方学校：${escapeHtml(otherSchool)}</p>`,
        `<p class="note">对方一句话介绍：${escapeHtml(otherIntro)}</p>`,
        infoHtml,
        '<p class="footer">此邮件由 LiLink 系统自动发送，请勿直接回复。</p>',
        '<hr>',
        '<p class="footer">— LiLink 团队 · <a href="https://lilink.top">lilink.top</a></p>',
      ].join(''),
    });

    return {
      dedupeKey: input.dedupeKey,
      recipientEmail: input.recipientEmail,
      subject,
      html,
      text,
      messageCategory: OutboundEmailMessageCategory.TRANSACTIONAL,
    };
  }

  /**
   * Queue payload for optional / marketing / list mail. Use a separate From
   * (SMTP_FROM_BULK) when configured so transactional reputation stays isolated.
   * Set MAIL_LIST_UNSUBSCRIBE_URL for List-Unsubscribe on bulk sends.
   */
  buildBulkEmail(input: {
    dedupeKey: string;
    recipientEmail: string;
    subject: string;
    html: string;
    text: string | null;
    maxAttempts?: number;
  }) {
    return {
      dedupeKey: input.dedupeKey,
      recipientEmail: input.recipientEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
      messageCategory: OutboundEmailMessageCategory.BULK,
      maxAttempts: input.maxAttempts ?? 5,
    };
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
      const staleProcessingThreshold = new Date(
        now.getTime() - OUTBOUND_EMAIL_STALE_PROCESSING_MS,
      );
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
        // messageCategory ascending puts TRANSACTIONAL (verification codes,
        // introductions) ahead of BULK so latency-sensitive mail is not starved
        // behind older bulk sends; createdAt keeps FIFO within each category.
        orderBy: [{ messageCategory: 'asc' }, { createdAt: 'asc' }],
        take:
          options.dedupeKeys?.length ??
          options.limit ??
          env.OUTBOUND_EMAIL_FLUSH_BATCH_SIZE,
      });

      await Promise.all(
        queuedEmails.map((queuedEmail) =>
          this.processOutboundEmail(queuedEmail),
        ),
      );
    } finally {
      this.isFlushing = false;
    }
  }

  async deliverQueuedEmailNow(dedupeKey: string) {
    const email = await this.prisma.outboundEmail.findUnique({
      where: { dedupeKey },
    });

    if (!email) {
      return null;
    }

    if (email.status === 'SENT' || email.status === 'EXHAUSTED') {
      return email;
    }

    const result = await this.processOutboundEmail(email);
    if (result === 'claimed-by-another-worker') {
      return this.waitForOutboundEmailCompletion(dedupeKey);
    }

    return this.prisma.outboundEmail.findUnique({
      where: { dedupeKey },
    });
  }

  private async processOutboundEmail(
    email: OutboundEmailRecord,
  ): Promise<'processed' | 'claimed-by-another-worker' | 'not-eligible'> {
    const claimedAt = new Date();
    const claimWhere = this.buildClaimWhere(email, claimedAt);
    if (!claimWhere) {
      return 'not-eligible';
    }

    const claimResult = await this.prisma.outboundEmail.updateMany({
      where: claimWhere,
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: claimedAt,
        errorMessage: null,
      },
    });

    if (claimResult.count === 0) {
      return 'claimed-by-another-worker';
    }

    try {
      if (
        email.messageCategory === OutboundEmailMessageCategory.BULK &&
        env.MAIL_LIST_UNSUBSCRIBE_URL.length === 0
      ) {
        this.logger.warn(
          `Bulk email ${email.dedupeKey} has no MAIL_LIST_UNSUBSCRIBE_URL; add one for better list compliance.`,
        );
      }
      const sentAt = new Date();
      const from = resolveSmtpFromForCategory(email.messageCategory);
      await this.sendGate.run(async () => {
        await this.transporter.sendMail({
          from,
          to: email.recipientEmail,
          subject: email.subject,
          html: email.html,
          text: email.text ?? undefined,
          headers: buildSendHeaders(email.messageCategory),
        });
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

    return 'processed';
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

  private buildClaimWhere(email: OutboundEmailRecord, now: Date) {
    if (email.status === 'PENDING') {
      return {
        id: email.id,
        status: 'PENDING' as const,
      };
    }

    if (email.status === 'FAILED') {
      return {
        id: email.id,
        status: 'FAILED' as const,
        nextAttemptAt: { lte: now },
      };
    }

    if (email.status === 'PROCESSING') {
      return {
        id: email.id,
        status: 'PROCESSING' as const,
        lastAttemptAt: {
          lt: new Date(now.getTime() - OUTBOUND_EMAIL_STALE_PROCESSING_MS),
        },
      };
    }

    return null;
  }

  private async waitForOutboundEmailCompletion(dedupeKey: string) {
    const deadline = Date.now() + OUTBOUND_EMAIL_SYNC_WAIT_TIMEOUT_MS;

    while (true) {
      const email = await this.prisma.outboundEmail.findUnique({
        where: { dedupeKey },
      });

      if (!email) {
        return null;
      }

      if (email.status !== 'PROCESSING' || Date.now() >= deadline) {
        return email;
      }

      await this.sleep(OUTBOUND_EMAIL_SYNC_WAIT_INTERVAL_MS);
    }
  }

  private sleep(durationMs: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, durationMs);
    });
  }
}
