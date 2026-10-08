import 'reflect-metadata';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const workspace = process.env.E2E_WORKSPACE;
const target = new URL(process.env.DATABASE_URL ?? 'invalid:');
if (
  !workspace ||
  realpathSync(path.resolve(process.cwd(), '../..')) !==
    realpathSync(workspace) ||
  existsSync(path.join(workspace, '.env')) ||
  existsSync(path.join(workspace, 'apps/api/.env')) ||
  target.protocol !== 'postgresql:' ||
  target.hostname !== '127.0.0.1' ||
  target.username !== 'e2e' ||
  !target.port ||
  target.port === '5432' ||
  !/^\/lilink_vip_test_[a-f0-9]+$/.test(target.pathname) ||
  target.search ||
  target.hash
) {
  throw new Error('API tests require the disposable E2E runner workspace.');
}
process.env.JWT_SECRET ??= '1234567890abcdef';
process.env.ADMIN_JWT_SECRET ??= 'abcdef1234567890';
process.env.MERCHANT_JWT_SECRET ??= 'fedcba0987654321';
process.env.ADMIN_COOKIE_NAME ??= 'lilink_admin_token';
process.env.MERCHANT_COOKIE_NAME ??= 'lilink_merchant_token';
process.env.SMTP_FROM ??= 'LiLink <hello@lilink.zone>';
process.env.CRON_SECRET ??= 'abcdef1234567890';
process.env.REDEEM_TICKET_SECRET ??= 'test-redeem-ticket-secret-0123456789';
