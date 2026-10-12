function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderMatchEmail(input: {
  subject: string;
  name: string;
  school: string;
  introduction: string;
  infoLines: string[];
  matchUrl: string;
  siteUrl: string;
}) {
  const e = escapeHtml;
  const logoUrl = new URL('/icons/icon-512.d972b64e510a.png', input.siteUrl)
    .href;
  const details = [
    `对方学校：${input.school}`,
    `对方一句话介绍：${input.introduction}`,
    ...input.infoLines,
  ]
    .map(
      (line) =>
        `<p style="margin:0 0 16px;color:#6b5b50;overflow-wrap:anywhere">${e(line)}</p>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(input.subject)}</title><style>@media(max-width:480px){.outer{padding:16px 10px!important}.inner{padding:28px 24px!important}.headline{font-size:30px!important}.hero{padding:32px 24px!important}}</style></head>
<body style="margin:0;background:#f2eee8;color:#332820;font-family:'Avenir Next','PingFang SC','Microsoft YaHei',Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">本轮匹配结果已公布，登录 LiLink 查看这封来信。</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="outer" align="center" style="padding:40px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;background:#fffdf9;border:1px solid #e6ded4;border-radius:20px;overflow:hidden">
<tr><td class="hero" align="center" style="padding:40px 32px 34px;background:#faf8f5;border-bottom:1px solid #e9e1d7">
<img src="${e(logoUrl)}" alt="LiLink 飞鸟衔信 Logo" width="84" height="84" style="display:block;width:84px;height:84px;margin:0 auto 10px">
<div style="font-family:Georgia,'Songti SC',serif;font-size:24px;font-weight:bold;letter-spacing:1px;color:#74685c">LiLink</div>
<div style="margin-top:6px;font-size:12px;letter-spacing:2px;color:#8d7d70">校园里的，认真相遇</div>
<h1 class="headline" style="margin:28px 0 0;font-family:Georgia,'Songti SC',serif;font-size:36px;line-height:1.3;color:#5d2330">本轮匹配已揭晓</h1>
</td></tr>
<tr><td class="inner" style="padding:36px 40px 40px;font-size:16px;line-height:1.9">
<p style="margin:0 0 24px">本轮匹配结果已公布，你与 <span style="font-family:Georgia,'Iowan Old Style','Songti SC','STSong',serif;font-size:23px;font-weight:bold;color:#8b3a4a;overflow-wrap:anywhere">${e(input.name)}</span> 匹配成功。</p>
${details}
<p style="margin:24px 0 20px;color:#6b5b50">请点击下方链接，登录 LiLink 查看这封来信和对方联系方式。</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#8b3a4a" style="border-radius:10px"><a href="${e(input.matchUrl)}" style="display:block;padding:16px 12px;color:#fff7ee;font-size:16px;font-weight:bold;text-decoration:none;border:1px solid #8b3a4a;border-radius:10px">查看我的匹配 →</a></td></tr></table>
<p style="margin:24px 0;font-size:12px;color:#8d7d70">此邮件由 LiLink 系统自动发送，请勿直接回复。</p>
<p style="margin:0;padding-top:22px;border-top:1px solid #e9e1d7;font-size:14px;line-height:1.9;color:#74685c">— LiLink 团队<br><a href="${e(input.siteUrl)}" style="color:#8b3a4a;text-decoration:none">${e(input.siteUrl)}</a></p>
</td></tr></table></td></tr></table></body></html>`;
}
