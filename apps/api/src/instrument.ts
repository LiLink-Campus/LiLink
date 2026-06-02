import * as Sentry from '@sentry/nestjs';
import { env } from './config/env';

Sentry.init({
  dsn: env.SENTRY_DSN || undefined,
  enabled: env.SENTRY_DSN.length > 0,
  environment: env.APP_ENV,
  release: env.SENTRY_RELEASE || undefined,
  dist: env.SENTRY_DIST || undefined,
  tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  enableLogs: env.SENTRY_ENABLE_LOGS,
  sendDefaultPii: env.SENTRY_SEND_DEFAULT_PII,
});
