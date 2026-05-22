// Best-effort detection of bots and link-preview crawlers (including WeChat's
// link prefetch) so referral CLICK events reflect real visitors. This is a
// funnel-quality filter, not a security control. Match is a lowercase substring
// check on the User-Agent; an empty UA is treated as non-human (prefetch /
// scanner). Note: WeChat's in-app browser (MicroMessenger) is a real user and
// is intentionally NOT matched.
const BOT_USER_AGENT_PATTERNS = [
  'bot',
  'spider',
  'crawler',
  'crawl',
  'slurp',
  'bingpreview',
  'facebookexternalhit',
  'embedly',
  'quora link preview',
  'telegrambot',
  'whatsapp',
  'preview',
  'scan',
  'curl',
  'wget',
  'python-requests',
  'headless',
] as const;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim() === '') {
    return true;
  }
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENT_PATTERNS.some((pattern) => ua.includes(pattern));
}
