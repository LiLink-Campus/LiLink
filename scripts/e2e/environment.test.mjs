import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestDatabase, testEnvironment } from './environment.mjs';

test('only isolated loopback databases on dedicated ports are allowed', () => {
  assert.doesNotThrow(() => assertTestDatabase('postgresql://e2e:e2e@127.0.0.1:54321/lilink_e2e_ab12'));
  for (const url of [
    'postgresql://x:x@production.example:54321/lilink_e2e_ab12',
    'postgresql://x:x@127.0.0.1:5432/lilink_e2e_ab12',
    'postgresql://x:x@127.0.0.1:54321/lilink',
    'postgresql://e2e:e2e@127.0.0.1:54321/lilink_e2e_ab12?host=production.invalid',
  ]) assert.throws(() => assertTestDatabase(url));
});
test('inherited credentials and endpoint overrides never enter the test environment', () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://production.invalid/db';
  try {
    const env = testEnvironment({ dbPort: 54321, smtpPort: 25251, mailPort: 18025, apiPort: 44001, webPort: 43001, runId: 'ab12' });
    assert.match(env.DATABASE_URL, /127\.0\.0\.1:54321\/lilink_e2e_ab12$/);
    assert.equal(env.SMTP_USER, '');
    assert.equal(env.APP_ENV, 'test');
    assert.notEqual(env.JWT_SECRET, testEnvironment({ dbPort: 54321, smtpPort: 25251, mailPort: 18025, apiPort: 44001, webPort: 43001, runId: 'ab12' }).JWT_SECRET);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

// Exercise the actual Prisma configuration before any database command is run.
test('Prisma refuses inherited targets and dotenv cannot replace the isolated target', async () => {
  const { mkdtemp, mkdir, writeFile, copyFile, symlink, rm } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(path.join(tmpdir(), 'lilink-prisma-config-'));
  try {
    await mkdir(path.join(root, 'apps/api'), { recursive: true });
    await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
    await copyFile('apps/api/prisma.config.ts', path.join(root, 'apps/api/prisma.config.ts'));
    await writeFile(path.join(root, '.env'), 'DATABASE_URL=postgresql://synthetic.invalid/root');
    await writeFile(path.join(root, 'apps/api/.env'), 'DATABASE_URL=postgresql://synthetic.invalid/api');
    const read = (database) => execFileSync(process.execPath, ['--input-type=module', '-e',
      "import c from './apps/api/prisma.config.ts'; console.log(c.datasource.url)"], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, E2E_WORKSPACE: root, ...(database ? { DATABASE_URL: database } : {}) },
    }).trim();
    const safe = 'postgresql://e2e:e2e@127.0.0.1:54321/lilink_e2e_ab12';
    assert.equal(read(safe), safe);
    for (const target of [undefined, 'postgresql://synthetic.invalid/db',
      'postgresql://e2e:e2e@127.0.0.1:5432/lilink_e2e_ab12',
      'postgresql://e2e:e2e@127.0.0.1:54321/lilink',
      safe + '?host=production.invalid']) {
      assert.throws(() => read(target));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('API test bootstrap refuses unowned workspaces before importing database clients', async () => {
  const { mkdtemp, mkdir, copyFile, symlink, writeFile, rm } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const path = await import('node:path');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(path.join(tmpdir(), 'lilink-jest-guard-'));
  try {
    const api = path.join(root, 'apps/api');
    await mkdir(api, { recursive: true });
    await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'));
    await copyFile('apps/api/test/jest.setup.ts', path.join(api, 'jest.setup.ts'));
    const invoke = overrides => execFileSync(process.execPath, ['jest.setup.ts'], {
      cwd: api, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, E2E_WORKSPACE: root,
        DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:54321/lilink_vip_test_ab12', ...overrides },
    });
    assert.doesNotThrow(() => invoke({}));
    for (const overrides of [{ E2E_WORKSPACE: '' }, { DATABASE_URL: '' },
      { DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:5432/lilink_vip_test_ab12' },
      { DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:54321/lilink_vip_test_ab12?host=unsafe.invalid' }]) {
      assert.throws(() => invoke(overrides));
    }
    await writeFile(path.join(api, '.env'), 'DATABASE_URL=postgresql://synthetic.invalid/local');
    assert.throws(() => invoke({}));
  } finally { await rm(root, { recursive: true, force: true }); }
});
