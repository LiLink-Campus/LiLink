import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestDatabase, testEnvironment } from './environment.mjs';

test('only isolated loopback databases on dedicated ports are allowed', () => {
  assert.doesNotThrow(() => assertTestDatabase('postgresql://e2e:e2e@127.0.0.1:54321/lilink_e2e_ab12'));
  for (const url of [
    'postgresql://x:x@production.example:54321/lilink_e2e_ab12',
    'postgresql://x:x@127.0.0.1:5432/lilink_e2e_ab12',
    'postgresql://x:x@127.0.0.1:54321/lilink',
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
