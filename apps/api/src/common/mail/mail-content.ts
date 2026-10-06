import { OutboundEmailMessageCategory } from '../prisma/client';
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

export type OutboundEmailRecord = {
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

export class MailContent {
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

  buildMatchRevealEmails(input: IntroductionEmailInput) {
    return [input.requester, input.recipient].map((party, index) => {
      const otherParty = index === 0 ? input.recipient : input.requester;
      const name = otherParty.displayName ?? 'LiLink 用户';
      return this.buildIntroductionEmail({
        dedupeKey: `match-reveal:${input.matchId}:${index}`,
        recipientEmail: party.email,
        otherParty,
        otherPartyDisplayName: name,
        leadingSentence: `本轮匹配结果已公布，你与 ${name} 匹配成功。可以直接通过以下方式联系对方，也可以登录 LiLink 查看这封来信。`,
      });
    });
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
}
