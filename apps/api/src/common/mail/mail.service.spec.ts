const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({
      sendMail,
    })),
  },
}));

import { MailService } from './mail.service';

describe('MailService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('builds a pair of deduplicated introduction emails', () => {
    const service = new MailService({
      outboundEmail: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    } as never);

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
        reasons: ['reason'],
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

  it('escapes user-controlled fields in introduction email HTML', () => {
    const service = new MailService({
      outboundEmail: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    } as never);

    const [requesterEmail, recipientEmail] = service.buildIntroductionEmails({
      matchId: 'match-1',
      requester: {
        email: 'requester@example.com',
        displayName: '<script>alert(1)</script>',
        schoolName: 'A&B School',
        headline: 'Hello <b>world</b>',
      },
      recipient: {
        email: 'recipient@example.com',
        displayName: '<img src=x onerror=alert(2)>',
        schoolName: 'R&D School',
        headline: 'Intro <i>text</i>',
      },
      reasons: ['Reason <strong>1</strong>'],
    });

    expect(requesterEmail.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(requesterEmail.html).toContain('&lt;i&gt;text&lt;/i&gt;');
    expect(requesterEmail.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(requesterEmail.html).not.toContain('<i>text</i>');
    expect(requesterEmail.html).toContain('&lt;strong&gt;1&lt;/strong&gt;');

    expect(recipientEmail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(recipientEmail.html).toContain('Hello &lt;b&gt;world&lt;/b&gt;');
    expect(recipientEmail.html).toContain('A&amp;B School');
  });

  it('flushes pending emails and marks them as sent', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'email-1',
        dedupeKey: 'match-introduction:match-1:requester',
        recipientEmail: 'user-1@example.com',
        subject: 'Subject',
        html: '<p>Hello</p>',
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
      },
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(undefined);
    const service = new MailService({
      outboundEmail: {
        findMany,
        updateMany,
        update,
      },
    } as never);

    sendMail.mockResolvedValueOnce(undefined);

    await service.flushQueuedEmails();

    const sendMailCalls = sendMail.mock.calls as Array<
      [
        {
          from: string;
          to: string;
          subject: string;
          html: string;
        },
      ]
    >;
    const sentMessage = sendMailCalls[0]?.[0];
    expect(sentMessage).toBeDefined();
    expect(typeof sentMessage?.from).toBe('string');
    expect(sentMessage?.to).toBe('user-1@example.com');
    expect(sentMessage?.subject).toBe('Subject');
    expect(sentMessage?.html).toBe('<p>Hello</p>');

    const updateCalls = update.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { status: string };
        },
      ]
    >;
    const updatePayload = updateCalls[0]?.[0];
    expect(updatePayload).toBeDefined();
    expect(updatePayload).toMatchObject({
      where: { id: 'email-1' },
      data: { status: 'SENT' },
    });
  });
});
