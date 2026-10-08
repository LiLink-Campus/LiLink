import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTargets, resolveRehearsalDatabase, resolveLoadTarget, resolveDatabaseTarget } from './targets.mjs';
test('load guards accept exact synthetic targets and reject production or copied user databases', () => {
  for (const target of loadTargets) {
    const url = `postgresql://${target.role}:synthetic@${target.directHost}/${target.database}`;
    assert.deepEqual(resolveDatabaseTarget(url), target);
    assert.deepEqual(resolveLoadTarget(target), target);
    assert.throws(() => resolveDatabaseTarget(url.replace(target.role, 'neondb_owner')));
    assert.throws(() => resolveLoadTarget({ ...target, branchId: 'br-restless-credit-aozwmv5h' }));
  }
  const local = loadTargets[1];
  assert.throws(() => resolveDatabaseTarget(`postgresql://${local.role}:synthetic@${local.directHost}/neondb`));
  assert.throws(() => resolveLoadTarget({ ...local, database: 'neondb' }));
  assert.throws(() => resolveDatabaseTarget('postgresql://release_load:synthetic@ep-lucky-wave-aoy717xy.c-2.ap-southeast-1.aws.neon.tech/neondb'));
});

test('temporary rehearsal targets require the exact task, internal host and role', () => {
  const id = 'abc123def456';
  const url = `postgresql://rehearsal:synthetic@release-db:5432/lilink_rehearsal_${id}`;
  assert.equal(resolveRehearsalDatabase(url, id).pathname, `/lilink_rehearsal_${id}`);
  for (const candidate of [url.replace('release-db', 'production.invalid'),
    url.replace('rehearsal:', 'owner:'), url.replace(id, 'abc123def457'),
    url + '?host=production.invalid', url.replace(':5432', ':5433')]) {
    assert.throws(() => resolveRehearsalDatabase(candidate, id));
  }
  assert.throws(() => resolveRehearsalDatabase(url, undefined));
  assert.throws(() => resolveDatabaseTarget(url));
});
