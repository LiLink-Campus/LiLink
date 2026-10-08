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
