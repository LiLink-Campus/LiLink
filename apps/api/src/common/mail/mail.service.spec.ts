const sendMail = jest.fn();
const createTransport = jest.fn(() => ({
  sendMail,
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport,
  },
}));

import { env } from '../../config/env';
import { MailService } from './mail.service';

type OutboundEmailStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'EXHAUSTED';

function buildOutboundEmail(
  overrides: Partial<{
    id: string;
    dedupeKey: string;
    recipientEmail: string;
    subject: string;
    html: string;
    text: string | null;
    messageCategory: 'TRANSACTIONAL' | 'BULK';
    status: OutboundEmailStatus;
    attempts: number;
    maxAttempts: number;
    lastAttemptAt: Date | null;
    nextAttemptAt: Date | null;
  }> = {},
) {
  return {
    id: 'email-1',
    dedupeKey: 'verification-code:code-1',
    recipientEmail: 'user@example.com',
    subject: 'Subject',
    html: '<p>Hello</p>',
    text: null,
    messageCategory: 'TRANSACTIONAL' as const,
    status: 'PENDING' as OutboundEmailStatus,
    attempts: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    nextAttemptAt: null,
    ...overrides,
  };
}

function createMailService(
  overrides: {
    emailCode?: {
      updateMany?: jest.Mock;
    };
    outboundEmail?: {
      findMany?: jest.Mock;
      findUnique?: jest.Mock;
      updateMany?: jest.Mock;
      update?: jest.Mock;
    };
  } = {},
) {
  return new MailService({
    emailCode: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...overrides.emailCode,
    },
    outboundEmail: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue(undefined),
      ...overrides.outboundEmail,
    },
  } as never);
}

describe('MailService', () => {
  const originalSendConcurrency = env.SMTP_SEND_CONCURRENCY;

  afterEach(() => {
    jest.clearAllMocks();
    sendMail.mockReset();
    createTransport.mockReset();
    createTransport.mockImplementation(() => ({
      sendMail,
    }));
    env.SMTP_SEND_CONCURRENCY = originalSendConcurrency;
  });

  it('builds a pair of deduplicated introduction emails', () => {
    const service = createMailService();

    expect(
      service.buildIntroductionEmails({
        matchId: 'match-1',
        requester: {
          email: 'user-1@example.com',
          displayName: 'User 1',
        },
        recipient: {
          email: 'user-2@example.com',
          displayName: 'User 2',
        },
        reason: 'reason paragraph',
        conversationTopics: ['topic 1', 'topic 2', 'topic 3'],
      }),
    ).toEqual([
      expect.objectContaining({
        dedupeKey: 'match-introduction:match-1:requester',
        recipientEmail: 'user-1@example.com',
      }),
      expect.objectContaining({
        dedupeKey: 'match-introduction:match-1:recipient',
        recipientEmail: 'user-2@example.com',
      }),
    ]);
  });

  it('builds a deduplicated meetup reminder email', () => {
    const service = createMailService();

    const built = service.buildMeetupReminderEmail({
      sessionId: 'session-1',
      recipientEmail: 'recipient@example.com',
      recipientDisplayName: 'User <B>',
      otherPartyDisplayName: 'User <A>',
      actionSentence: 'User <A> 已经发出见面提议，正在等你确认。',
      directUrl: 'https://lilink.test/dashboard/meetup/session-1?from=<mail>',
    });

    expect(built).toMatchObject({
      dedupeKey: 'meetup-reminder:session-1',
      recipientEmail: 'recipient@example.com',
      subject: 'LiLink 破冰会话待处理',
      messageCategory: 'TRANSACTIONAL',
    });
    expect(built.html).toContain('User &lt;A&gt;');
    expect(built.html).toContain(
      'https://lilink.test/dashboard/meetup/session-1?from=&lt;mail&gt;',
    );
    expect(built.html).not.toContain('User <A>');
    expect(built.text).toContain('User <A>');
  });

  it('escapes user-controlled fields in introduction email HTML', () => {
    const service = createMailService();

    const [requesterEmail, recipientEmail] = service.buildIntroductionEmails({
      matchId: 'match-1',
      requester: {
        email: 'requester@example.com',
        displayName: '<script>alert(1)</script>',
        schoolName: 'A&B School',
        introLine: 'Hello <b>world</b>',
      },
      recipient: {
        email: 'recipient@example.com',
        displayName: '<img src=x onerror=alert(2)>',
        schoolName: 'R&D School',
        introLine: 'Intro <i>text</i>',
      },
      reason: 'Reason <strong>1</strong>',
      conversationTopics: ['Topic <strong>1</strong>', 'Topic 2', 'Topic 3'],
    });

    expect(requesterEmail.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(requesterEmail.html).toContain('&lt;i&gt;text&lt;/i&gt;');
    expect(requesterEmail.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(requesterEmail.html).not.toContain('<i>text</i>');
    expect(requesterEmail.html).toContain(
      'Reason &lt;strong&gt;1&lt;/strong&gt;',
    );
    expect(requesterEmail.html).toContain(
      'Topic &lt;strong&gt;1&lt;/strong&gt;',
    );

    expect(recipientEmail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(recipientEmail.html).toContain('Hello &lt;b&gt;world&lt;/b&gt;');
    expect(recipientEmail.html).toContain('A&amp;B School');
  });

  it('renders the other party selected public contact in introduction email', () => {
    const service = createMailService();

    const [requesterEmail, recipientEmail] = service.buildIntroductionEmails({
      matchId: 'match-1',
      requester: {
        email: 'requester@example.com',
        displayName: 'Requester',
        publicContact: {
          type: 'WECHAT',
          label: '微信号',
          value: 'wx_user_1',
        },
      },
      recipient: {
        email: 'recipient@example.com',
        displayName: 'Recipient',
        publicContact: {
          type: 'PHONE',
          label: '手机号',
          value: '+14155552671',
        },
      },
      reason: 'reason paragraph',
      conversationTopics: ['topic 1'],
    } as never);

    expect(requesterEmail.text).toContain('对方联系方式：手机号 +14155552671');
    expect(requesterEmail.html).toContain(
      '对方联系方式：<strong>手机号 +14155552671</strong>',
    );
    expect(recipientEmail.text).toContain('对方联系方式：微信号 wx_user_1');
    expect(recipientEmail.html).toContain(
      '对方联系方式：<strong>微信号 wx_user_1</strong>',
    );
  });

  it('builds a verification email payload with a small retry budget', () => {
    const service = createMailService();

    const built = service.buildVerificationCodeEmail({
      dedupeKey: 'verification-code:code-1',
      recipientEmail: 'user@example.com',
      code: '123456',
    });

    expect(built).toMatchObject({
      dedupeKey: 'verification-code:code-1',
      recipientEmail: 'user@example.com',
      subject: 'LiLink 验证码 123456',
      maxAttempts: 3,
    });
    expect(built.html).toContain('123456');
    expect(built.html).toContain('<!doctype html>');
    expect(built.text).toContain('123456');
    expect(built.text).toContain('LiLink 团队');
  });

  it('includes anti-spam transactional headers when sending', async () => {
    const findMany = jest.fn().mockResolvedValue([
      buildOutboundEmail({
        text: 'Plain text body',
      }),
    ]);
    const update = jest.fn().mockResolvedValue(undefined);
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = createMailService({
      emailCode: { updateMany: emailCodeUpdateMany },
      outboundEmail: {
        findMany,
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update,
      },
    });

    sendMail.mockResolvedValueOnce(undefined);
    await service.flushQueuedEmails();

    const [[sentMessage]] = sendMail.mock.calls as [
      [
        {
          text?: string;
          headers?: Record<string, string>;
        },
      ],
    ];

    expect(sentMessage.text).toBe('Plain text body');
    expect(sentMessage.headers).toEqual(
      expect.objectContaining({
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'Content-Language': 'zh-CN',
      }),
    );
  });

  it('configures the SMTP transporter to use pooled connections', () => {
    createMailService();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        pool: true,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
        maxConnections: env.SMTP_MAX_CONNECTIONS,
        maxMessages: env.SMTP_MAX_MESSAGES,
        connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
      }),
    );
  });

  it('flushes pending emails and marks them as sent', async () => {
    const findMany = jest.fn().mockResolvedValue([
      buildOutboundEmail({
        dedupeKey: 'match-introduction:match-1:requester',
        recipientEmail: 'user-1@example.com',
        maxAttempts: 5,
      }),
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = createMailService({
      emailCode: {
        updateMany: emailCodeUpdateMany,
      },
      outboundEmail: {
        findMany,
        updateMany,
        update,
      },
    });

    sendMail.mockResolvedValueOnce(undefined);

    await service.flushQueuedEmails();

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user-1@example.com',
        subject: 'Subject',
        html: '<p>Hello</p>',
      }),
    );
    const [[sentUpdate]] = update.mock.calls as [
      [
        {
          where: { id: string };
          data: { status: string };
        },
      ],
    ];
    expect(sentUpdate.where.id).toBe('email-1');
    expect(sentUpdate.data.status).toBe('SENT');
    expect(emailCodeUpdateMany).not.toHaveBeenCalled();
  });

  it('marks a verification code as sent after queued delivery succeeds', async () => {
    const findMany = jest.fn().mockResolvedValue([buildOutboundEmail()]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = createMailService({
      emailCode: {
        updateMany: emailCodeUpdateMany,
      },
      outboundEmail: {
        findMany,
        updateMany,
        update,
      },
    });

    sendMail.mockResolvedValueOnce(undefined);

    await service.flushQueuedEmails({
      dedupeKeys: ['verification-code:code-1'],
    });

    const [[deliveryStatusUpdate]] = emailCodeUpdateMany.mock.calls as [
      [
        {
          where: { deliveryDedupeKey: string };
          data: { deliveryStatus: string; sentAt: Date };
        },
      ],
    ];
    expect(deliveryStatusUpdate.where.deliveryDedupeKey).toBe(
      'verification-code:code-1',
    );
    expect(deliveryStatusUpdate.data.deliveryStatus).toBe('SENT');
    expect(deliveryStatusUpdate.data.sentAt).toBeInstanceOf(Date);
  });

  it('delivers a targeted verification email even while the queue worker is busy', async () => {
    const findUnique = jest.fn().mockResolvedValue(buildOutboundEmail());
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = createMailService({
      emailCode: {
        updateMany: emailCodeUpdateMany,
      },
      outboundEmail: {
        findUnique,
        updateMany,
        update,
      },
    });

    sendMail.mockResolvedValueOnce(undefined);
    (service as unknown as { isFlushing: boolean }).isFlushing = true;

    const delivered = await service.deliverQueuedEmailNow(
      'verification-code:code-1',
    );

    expect(delivered).toMatchObject({
      dedupeKey: 'verification-code:code-1',
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(emailCodeUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight delivery to finish when another worker already claimed the email', async () => {
    const claimedAt = new Date();
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(
        buildOutboundEmail({
          status: 'PROCESSING',
          lastAttemptAt: claimedAt,
        }),
      )
      .mockResolvedValueOnce(
        buildOutboundEmail({
          status: 'SENT',
          lastAttemptAt: claimedAt,
        }),
      );
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = createMailService({
      outboundEmail: {
        findUnique,
        updateMany,
      },
    });

    const delivered = await service.deliverQueuedEmailNow(
      'verification-code:code-1',
    );

    expect(delivered).toMatchObject({
      dedupeKey: 'verification-code:code-1',
      status: 'SENT',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('caps synchronous email delivery at the configured send concurrency', async () => {
    env.SMTP_SEND_CONCURRENCY = 1;

    const releasedMessages: Array<() => void> = [];
    let currentInFlight = 0;
    let maxInFlight = 0;
    sendMail.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          currentInFlight += 1;
          maxInFlight = Math.max(maxInFlight, currentInFlight);
          releasedMessages.push(() => {
            currentInFlight -= 1;
            resolve();
          });
        }),
    );

    const seenKeys = new Map<string, number>();
    const findUnique = jest
      .fn()
      .mockImplementation(
        ({ where: { dedupeKey } }: { where: { dedupeKey: string } }) => {
          const seen = seenKeys.get(dedupeKey) ?? 0;
          seenKeys.set(dedupeKey, seen + 1);

          if (seen === 0) {
            return buildOutboundEmail({
              id: `email-${dedupeKey}`,
              dedupeKey,
            });
          }

          return buildOutboundEmail({
            id: `email-${dedupeKey}`,
            dedupeKey,
            status: 'SENT',
          });
        },
      );
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const service = createMailService({
      emailCode: {
        updateMany: emailCodeUpdateMany,
      },
      outboundEmail: {
        findUnique,
        updateMany,
        update,
      },
    });

    const firstDelivery = service.deliverQueuedEmailNow(
      'verification-code:code-1',
    );
    const secondDelivery = service.deliverQueuedEmailNow(
      'verification-code:code-2',
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);

    releasedMessages.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);

    releasedMessages.shift()?.();

    await expect(firstDelivery).resolves.toMatchObject({
      dedupeKey: 'verification-code:code-1',
      status: 'SENT',
    });
    await expect(secondDelivery).resolves.toMatchObject({
      dedupeKey: 'verification-code:code-2',
      status: 'SENT',
    });
  });
});
