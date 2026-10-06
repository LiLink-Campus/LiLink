import { createMailService } from './mail.service-test-fixture';

describe('Mail content', () => {
  it('builds a pair of deduplicated automatic reveal emails', () => {
    const service = createMailService();

    expect(
      service.buildMatchRevealEmails({
        matchId: 'match-1',
        requester: {
          email: 'user-1@example.com',
          displayName: 'User 1',
          gender: '男',
          partnerGenders: ['女', '非二元'],
          weeklyIntent: 'FRIEND',
        },
        recipient: {
          email: 'user-2@example.com',
          displayName: 'User 2',
          gender: '女',
          partnerGenders: ['男'],
          weeklyIntent: 'DATE',
        },
      }),
    ).toEqual([
      expect.objectContaining({
        dedupeKey: 'match-reveal:match-1:0',
        recipientEmail: 'user-1@example.com',
      }),
      expect.objectContaining({
        dedupeKey: 'match-reveal:match-1:1',
        recipientEmail: 'user-2@example.com',
      }),
    ]);
  });

  it('escapes user-controlled fields in introduction email HTML', () => {
    const service = createMailService();

    const [requesterEmail, recipientEmail] = service.buildMatchRevealEmails({
      matchId: 'match-1',
      requester: {
        email: 'requester@example.com',
        displayName: '<script>alert(1)</script>',
        schoolName: 'A&B School',
        introLine: 'Hello <b>world</b>',
        gender: '男',
        partnerGenders: ['女'],
        weeklyIntent: 'BOTH',
      },
      recipient: {
        email: 'recipient@example.com',
        displayName: '<img src=x onerror=alert(2)>',
        schoolName: 'R&D School',
        introLine: 'Intro <i>text</i>',
        gender: '女 <strong>1</strong>',
        partnerGenders: ['男 <strong>1</strong>', '非二元'],
        weeklyIntent: 'DATE',
      },
    });

    expect(requesterEmail.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    expect(requesterEmail.html).toContain('&lt;i&gt;text&lt;/i&gt;');
    expect(requesterEmail.html).not.toContain('<img src=x onerror=alert(2)>');
    expect(requesterEmail.html).not.toContain('<i>text</i>');
    expect(requesterEmail.html).toContain(
      '对方性别：女 &lt;strong&gt;1&lt;/strong&gt;',
    );
    expect(requesterEmail.html).toContain(
      '对方期望对象性别：男 &lt;strong&gt;1&lt;/strong&gt;、非二元',
    );
    expect(requesterEmail.html).toContain('对方本周意向：浪漫约会');

    expect(recipientEmail.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(recipientEmail.html).toContain('Hello &lt;b&gt;world&lt;/b&gt;');
    expect(recipientEmail.html).toContain('A&amp;B School');
    expect(recipientEmail.html).toContain('对方性别：男');
    expect(recipientEmail.html).toContain('对方期望对象性别：女');
    expect(recipientEmail.html).toContain('对方本周意向：都可以');
  });

  it('renders the other party selected public contact in introduction email', () => {
    const service = createMailService();

    const [requesterEmail, recipientEmail] = service.buildMatchRevealEmails({
      matchId: 'match-1',
      requester: {
        email: 'requester@example.com',
        displayName: 'Requester',
        publicContact: {
          type: 'WECHAT',
          label: '微信号',
          value: 'wx_user_1',
        },
        gender: '女',
        partnerGenders: ['男'],
        weeklyIntent: 'BOTH',
      },
      recipient: {
        email: 'recipient@example.com',
        displayName: 'Recipient',
        publicContact: {
          type: 'PHONE',
          label: '手机号',
          value: '+14155552671',
        },
        gender: '男',
        partnerGenders: ['女', '非二元'],
        weeklyIntent: 'FRIEND',
      },
    } as never);

    expect(requesterEmail.text).toContain('对方联系方式：手机号 +14155552671');
    expect(requesterEmail.text).toContain('对方性别：男');
    expect(requesterEmail.text).toContain('对方期望对象性别：女、非二元');
    expect(requesterEmail.text).toContain('对方本周意向：认识朋友');
    expect(requesterEmail.html).toContain(
      '对方联系方式：<strong>手机号 +14155552671</strong>',
    );
    expect(requesterEmail.html).toContain('对方性别：男');
    expect(requesterEmail.html).toContain('对方期望对象性别：女、非二元');
    expect(requesterEmail.html).toContain('对方本周意向：认识朋友');
    expect(recipientEmail.text).toContain('对方联系方式：微信号 wx_user_1');
    expect(recipientEmail.text).toContain('对方性别：女');
    expect(recipientEmail.text).toContain('对方期望对象性别：男');
    expect(recipientEmail.text).toContain('对方本周意向：都可以');
    expect(recipientEmail.html).toContain(
      '对方联系方式：<strong>微信号 wx_user_1</strong>',
    );
    expect(recipientEmail.html).toContain('对方性别：女');
    expect(recipientEmail.html).toContain('对方期望对象性别：男');
    expect(recipientEmail.html).toContain('对方本周意向：都可以');
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
});
