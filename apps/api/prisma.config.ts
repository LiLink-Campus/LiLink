import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(apiRoot, '..', '..');
const DATABASE_URL_ENV = 'DATABASE_URL';

if (process.env.E2E_WORKSPACE) {
  const target = new URL(process.env[DATABASE_URL_ENV] ?? 'invalid:');
  if (
    target.protocol !== 'postgresql:' ||
    target.hostname !== '127.0.0.1' ||
    !/^\/lilink_(?:e2e|vip_test)_[a-f0-9]+$/.test(target.pathname) ||
    !target.port ||
    target.port === '5432' ||
    target.username !== 'e2e' ||
    target.search ||
    target.hash
  ) {
    throw new Error('Refusing Prisma outside the disposable test database.');
  }
} else {
  // Explicit process configuration wins over local development files.
  config({
    path: [path.join(apiRoot, '.env'), path.join(repoRoot, '.env')],
    quiet: true,
  });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npm run prisma:seed',
  },
  datasource: {
    url: process.env[DATABASE_URL_ENV] ?? '',
  },
});
