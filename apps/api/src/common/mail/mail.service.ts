import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

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

  async sendVerificationCode(email: string, code: string) {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: 'LiLink verification code',
      text: `Your LiLink verification code is ${code}. It expires in 10 minutes.`,
      html: `<p>Your LiLink verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
    });

    if (env.APP_ENV !== 'production') {
      this.logger.log(`Verification code for ${email}: ${code}`);
    }
  }

  async sendIntroductionEmails(input: {
    requester: {
      email: string;
      displayName: string | null;
      schoolName?: string | null;
      headline?: string | null;
    };
    recipient: {
      email: string;
      displayName: string | null;
      schoolName?: string | null;
      headline?: string | null;
    };
    reasons: string[];
  }) {
    const requesterName = input.requester.displayName ?? 'LiLink 用户';
    const recipientName = input.recipient.displayName ?? 'LiLink 用户';
    const reasons = input.reasons
      .map((reason) => `<li>${reason}</li>`)
      .join('');

    await Promise.all([
      this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: input.requester.email,
        subject: `LiLink 已为你引荐 ${recipientName}`,
        html: `
          <p>你已成功请求联系 <strong>${recipientName}</strong>。</p>
          <p>对方邮箱：<strong>${input.recipient.email}</strong></p>
          <p>对方学校：${input.recipient.schoolName ?? '未填写'}</p>
          <p>对方简介：${input.recipient.headline ?? '暂无一句话介绍'}</p>
          <p>本次匹配理由：</p>
          <ul>${reasons}</ul>
        `,
      }),
      this.transporter.sendMail({
        from: env.SMTP_FROM,
        to: input.recipient.email,
        subject: `LiLink 已为你引荐 ${requesterName}`,
        html: `
          <p><strong>${requesterName}</strong> 请求与你建立联系。</p>
          <p>对方邮箱：<strong>${input.requester.email}</strong></p>
          <p>对方学校：${input.requester.schoolName ?? '未填写'}</p>
          <p>对方简介：${input.requester.headline ?? '暂无一句话介绍'}</p>
          <p>本次匹配理由：</p>
          <ul>${reasons}</ul>
        `,
      }),
    ]);
  }
}
