import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTargets, resolveSsrTarget, resolveLoadTarget, resolveDatabaseTarget } from './targets.mjs';
const expected = { alias: 'https://release-20260926.lilink.top', projectId: 'prj_bdgQbPghUNmgkWPueeJq8Z6ZAb4J', branch: 'codex/loading-performance-audit', deploymentId: 'dpl_synthetic', sha: 'a'.repeat(40) };
const actual = { ...expected, state: 'READY' };
test('SSR accepts only exact independent expected identity', () => {
  assert.equal(resolveSsrTarget(expected, actual, expected.sha), expected.alias);
  for (const field of ['alias', 'projectId', 'branch', 'deploymentId', 'sha', 'state']) {
    assert.throws(() => resolveSsrTarget(expected, { ...actual, [field]: 'unexpected' }, expected.sha));
  }
});
test('SSR refuses production, old previews and arbitrary projects even when identities agree', () => {
  for (const alias of ['https://lilink.top', 'https://release-20260920.lilink.top', 'http://release-20260926.lilink.top', 'https://release-20260926.lilink.top/other', 'https://unverified.vercel.app']) {
    assert.throws(() => resolveSsrTarget({ ...expected, alias }, { ...actual, alias }, expected.sha));
  }
  assert.throws(() => resolveSsrTarget({ ...expected, projectId: 'production' }, { ...actual, projectId: 'production' }, expected.sha));
  assert.throws(() => resolveSsrTarget(expected, actual, 'b'.repeat(40)));
});
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
