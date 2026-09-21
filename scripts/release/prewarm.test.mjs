import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPrewarmTarget } from '../../apps/api/scripts/prewarm-dashboard-snapshots.mjs';

const release = 'a'.repeat(40);
const options = { 'expected-release': release, 'expected-host': 'test.example', 'expected-database': 'isolated', apply: true };
const settings = { DATABASE_URL: 'postgresql://test:test@test.example/isolated', RELEASE_MAINTENANCE: 'true', BACKGROUND_JOBS_ENABLED: 'false', MAIL_DELIVERY_ENABLED: 'false' };

test('prewarming refuses mismatched databases, images and enabled writers', () => {
  assert.doesNotThrow(() => verifyPrewarmTarget(options, settings, release));
  assert.throws(() => verifyPrewarmTarget(options, { ...settings, DATABASE_URL: 'postgresql://test:test@production.example/isolated' }, release));
  assert.throws(() => verifyPrewarmTarget(options, { ...settings, DATABASE_URL: 'postgresql://test:test@test.example/production' }, release));
  assert.throws(() => verifyPrewarmTarget(options, settings, 'b'.repeat(40)));
  for (const [key, value] of [['RELEASE_MAINTENANCE', 'false'], ['BACKGROUND_JOBS_ENABLED', 'true'], ['MAIL_DELIVERY_ENABLED', 'true']]) {
    assert.throws(() => verifyPrewarmTarget(options, { ...settings, [key]: value }, release));
  }
});

test('read-only preflight does not require pausing the existing application', () => {
  assert.equal(verifyPrewarmTarget({ ...options, apply: false }, { ...settings, BACKGROUND_JOBS_ENABLED: 'true' }, release).apply, false);
});
