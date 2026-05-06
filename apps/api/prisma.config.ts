import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(apiRoot, '..', '..');
const DATABASE_URL_ENV = 'DATABASE_URL';

config({ path: path.join(repoRoot, '.env') });
config({ path: path.join(apiRoot, '.env'), override: true });

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
