import { randomBytes } from 'node:crypto';

export function assertTestDatabase(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      !/^\/lilink_e2e_[a-f0-9]+$/.test(url.pathname) || !url.port || url.port === '5432') {
    throw new Error('Refusing database outside the disposable E2E namespace.');
  }
}

export function testEnvironment({ dbPort, smtpPort, mailPort, apiPort, webPort, runId }) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'CI', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    APP_ENV: 'test', NODE_ENV: 'production',
    DATABASE_URL: `postgresql://e2e:e2e@127.0.0.1:${dbPort}/lilink_e2e_${runId}`,
    PORT: String(apiPort), CLIENT_ORIGIN: `http://127.0.0.1:${webPort}`,
    NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${apiPort}/v1`,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort), SMTP_SECURE: 'false',
    SMTP_FROM: 'LiLink E2E <test@example.test>', SMTP_USER: '', SMTP_PASS: '',
    SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '', NEXT_TELEMETRY_DISABLED: '1',
    E2E_RUN_ID: runId, E2E_WEB_URL: `http://127.0.0.1:${webPort}`,
    E2E_API_URL: `http://127.0.0.1:${apiPort}/v1`,
    E2E_MAIL_URL: `http://127.0.0.1:${mailPort}`,
  });
  for (const key of ['JWT_SECRET', 'ADMIN_JWT_SECRET', 'MERCHANT_JWT_SECRET', 'CRON_SECRET', 'REDEEM_TICKET_SECRET']) {
    env[key] = randomBytes(32).toString('hex');
  }
  assertTestDatabase(env.DATABASE_URL);
  return env;
}
