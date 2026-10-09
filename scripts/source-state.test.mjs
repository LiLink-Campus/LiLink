import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const script = path.resolve('scripts/release/local-rehearsal.mjs');
// Wrong commit attribution must fail before Docker: unstaged, staged and new
// image inputs are all unsafe; unrelated web edits do not change the API image.
test('rehearsal rejects modified build inputs before Docker and archives clean inputs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lilink-source-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString().trim();
  const marker = path.join(root, 'docker-called');
  try {
    for (const dir of ['apps/api/src', 'packages/shared', 'scripts/release', 'bin', 'apps/web']) await mkdir(path.join(root, dir), { recursive: true });
    for (const file of ['.dockerignore', 'package.json', 'package-lock.json', 'packages/shared/package.json', 'scripts/release/seed-load.mjs']) await writeFile(path.join(root, file), '{}\n');
    await writeFile(path.join(root, 'apps/api/src/main.ts'), 'committed API source\n');
    await writeFile(path.join(root, '.gitignore'), 'bin/\nartifacts/\ndocker-called\n');
    await writeFile(path.join(root, 'bin/docker'), `#!/usr/bin/env node
const fs=require('fs'); const cp=require('child_process');
if(process.argv[2]==='build') {
 const input=fs.readFileSync(0);
 fs.writeFileSync('scripts/release/seed-load.mjs','changed during build');
 const archived=file=>cp.spawnSync('tar',['-xOf','-',file],{input}).stdout.toString();
 fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({api:archived('apps/api/src/main.ts'),rehearsal:archived('scripts/release/seed-load.mjs')}));
 process.exit(77);
}
`, { mode: 0o755 });
    git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'fixture');
    const run = () => spawnSync(process.execPath, [script], { cwd: root, env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8', timeout: 10000 });
    for (const change of ['unstaged', 'staged', 'untracked']) {
      const file = change === 'untracked' ? 'apps/api/src/new.ts' : 'apps/api/src/main.ts';
      await writeFile(path.join(root, file), 'local API source\n');
      if (change === 'staged') git('add', file);
      const result = run();
      assert.notEqual(result.status, 0, change);
      assert.match(result.stderr, /uncommitted.*rehearsal/i, change);
      await assert.rejects(readFile(marker), { code: 'ENOENT' }, `${change}: Docker must not start`);
      git('reset', '--hard', '-q', 'HEAD');
      if (change === 'untracked') await rm(path.join(root, file));
    }
    await writeFile(path.join(root, 'apps/web/unrelated.ts'), 'local web work\n');
    const result = run();
    assert.notEqual(result.status, 0, 'stub stops after inspecting build input');
    assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), { api: 'committed API source\n', rehearsal: '{}\n' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
