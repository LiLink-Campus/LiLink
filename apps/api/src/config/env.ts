import { z } from 'zod';
import { preloadMonorepoEnvIntoProcess } from './monorepo-env-paths';

preloadMonorepoEnvIntoProcess();

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Comma-separated browser origins (e.g. https://example.com,https://www.example.com).
  CLIENT_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url()).min(1)),
  SENTRY_DSN: z
    .string()
    .default('')
    .transform((value) => value.trim())
    .refine(
      (value) => value.length === 0 || /^https?:\/\//i.test(value),
      'SENTRY_DSN must be empty or an http(s) URL.',
    ),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1),
  SENTRY_ENABLE_LOGS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  SENTRY_SEND_DEFAULT_PII: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SENTRY_RELEASE: z
    .string()
    .default('')
    .transform((value) => value.trim()),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters.'),
  ADMIN_JWT_SECRET: z
    .string()
    .min(16, 'ADMIN_JWT_SECRET must be at least 16 characters.'),
  MERCHANT_JWT_SECRET: z
    .string()
    .min(16, 'MERCHANT_JWT_SECRET must be at least 16 characters.'),
  USER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  ADMIN_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  MERCHANT_SESSION_TTL_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(14),
  COOKIE_NAME: z.string().default('lilink_token'),
  ADMIN_COOKIE_NAME: z.string().default('lilink_admin_token'),
  MERCHANT_COOKIE_NAME: z.string().default('lilink_merchant_token'),
  COOKIE_DOMAIN: z.string().optional(),
  SMTP_HOST: z.string().default('127.0.0.1'),
  SMTP_PORT: z.coerce.number().int().default(2525),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().min(1, 'SMTP_FROM is required.'),
  // Optional split From identities on the same SMTP account (e.g. noreply@ for OTP vs notify@ for bulk). Falls back to SMTP_FROM when empty.
  SMTP_FROM_TRANSACTIONAL: z.string().default(''),
  SMTP_FROM_BULK: z.string().default(''),
  // HTTPS URL for one-click or browser unsubscribe; used only when messageCategory is BULK.
  MAIL_LIST_UNSUBSCRIBE_URL: z
    .string()
    .default('')
    .transform((v) => v.trim())
    .refine(
      (s) => s.length === 0 || /^https?:\/\//i.test(s),
      'MAIL_LIST_UNSUBSCRIBE_URL must be empty or an http(s) URL.',
    ),
  SMTP_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(10),
  SMTP_MAX_MESSAGES: z.coerce.number().int().min(1).max(1000).default(100),
  SMTP_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(5000),
  SMTP_GREETING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(5000),
  SMTP_SOCKET_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .default(10_000),
  SMTP_SEND_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
  // Max emails claimed per scheduled flush (every 30s). Bounded by
  // SMTP_SEND_CONCURRENCY for the actual parallel send fan-out.
  OUTBOUND_EMAIL_FLUSH_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50),
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z
    .string()
    .min(12, 'ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.')
    .optional(),
  ADMIN_BOOTSTRAP_NAME: z.string().optional(),
  CRON_SECRET: z
    .string()
    .min(16, 'CRON_SECRET must be at least 16 characters.'),
  // Short-lived JWT secret for one-time redeem ticket tokens issued to merchants.
  REDEEM_TICKET_SECRET: z
    .string()
    .min(16, 'REDEEM_TICKET_SECRET must be at least 16 characters.'),
});

export const env = envSchema.parse(process.env);
