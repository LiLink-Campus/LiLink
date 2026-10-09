import { randomBytes } from 'node:crypto';

export function assertTestDatabase(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      !/^\/lilink_e2e_[a-f0-9]+$/.test(url.pathname) || !url.port || url.port === '5432' || url.search || url.hash || url.username !== 'e2e') {
    throw new Error('Refusing database outside the disposable E2E namespace.');
  }
}

export function testEnvironment({ dbPort, smtpPort, mailPort, apiPort, webPort, runId, sentryPort }) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'CI', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    APP_ENV: 'test', NODE_ENV: 'production',
    DATABASE_URL: `postgresql://e2e:e2e@127.0.0.1:${dbPort}/lilink_e2e_${runId}`,
    PUBLIC_CACHE_REVALIDATION_URL: `http://127.0.0.1:${webPort}/api/internal/public-cache/revalidate`,
    PORT: String(apiPort), CLIENT_ORIGIN: `http://127.0.0.1:${webPort}`,
    NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/v1`,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false',
    SMTP_FROM: 'LiLink E2E <test@example.test>', SMTP_USER: '', SMTP_PASS: '',
    SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '', NEXT_TELEMETRY_DISABLED: '1',
    E2E_RUN_ID: runId, E2E_WEB_URL: `http://127.0.0.1:${webPort}`,
    E2E_API_URL: `http://127.0.0.1:${apiPort}/v1`,
    E2E_MAIL_URL: `http://127.0.0.1:${mailPort}`,
  });
  for (const key of ['PUBLIC_CACHE_REVALIDATION_SECRET', 'JWT_SECRET', 'ADMIN_JWT_SECRET', 'MERCHANT_JWT_SECRET', 'CRON_SECRET', 'REDEEM_TICKET_SECRET']) {
    env[key] = randomBytes(32).toString('hex');
  }
  assertTestDatabase(env.DATABASE_URL);
  if (sentryPort !== undefined) {
    if (!Number.isInteger(sentryPort) || sentryPort < 1024 || sentryPort > 65535 ||
        [dbPort, smtpPort, mailPort, apiPort, webPort].includes(sentryPort)) {
      throw new Error('Sentry tracing requires its own disposable loopback collector port.');
    }
    env.NEXT_PUBLIC_SENTRY_DSN = `http://public@127.0.0.1:${sentryPort}/1`;
    env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE = '1';
    env.NEXT_PUBLIC_SENTRY_SEND_DEFAULT_PII = 'false';
    env.E2E_SENTRY_TRACING = '1';
    env.E2E_SENTRY_URL = `http://127.0.0.1:${sentryPort}`;
  }
  return env;
}
