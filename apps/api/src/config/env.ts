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
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters.'),
  ADMIN_JWT_SECRET: z
    .string()
    .min(16, 'ADMIN_JWT_SECRET must be at least 16 characters.'),
  USER_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  ADMIN_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  COOKIE_NAME: z.string().default('lilink_token'),
  ADMIN_COOKIE_NAME: z.string().default('lilink_admin_token'),
  COOKIE_DOMAIN: z.string().optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().min(1, 'SMTP_FROM is required.'),
  DEEPSEEK_API_KEY: z.string().default(''),
  DEEPSEEK_MODEL: z.string().trim().min(1).default('deepseek-v4-flash'),
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
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z
    .string()
    .min(12, 'ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters.')
    .optional(),
  ADMIN_BOOTSTRAP_NAME: z.string().optional(),
  CRON_SECRET: z
    .string()
    .min(16, 'CRON_SECRET must be at least 16 characters.'),
});

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
