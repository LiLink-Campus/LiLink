import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters.'),
  ADMIN_JWT_SECRET: z
    .string()
    .min(16, 'ADMIN_JWT_SECRET must be at least 16 characters.'),
  COOKIE_NAME: z.string().default('lilink_token'),
  ADMIN_COOKIE_NAME: z.string().default('lilink_admin_token'),
  COOKIE_DOMAIN: z.string().optional(),
  ALLOWED_EMAIL_DOMAINS: z.string().default(''),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().min(1, 'SMTP_FROM is required.'),
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

export function allowedEmailDomains() {
  return env.ALLOWED_EMAIL_DOMAINS.split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}
