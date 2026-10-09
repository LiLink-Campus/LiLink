import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { withStaticImageCache } from './generation-cache.mjs';

// Cache failures: stale inputs, missing/tampered outputs, unsuccessful generation,
// concurrent writes and inputs changing during generation must never become hits.
test('static generation reuses only complete content-verified output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lilink-image-cache-'));
  const write = async (file, value) => { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, value); };
  const outputs = [
    'apps/web/public/images/responsive/test.webp', 'apps/web/public/images/school-atlases/test.webp',
    'apps/web/src/lib/static-image-manifest.ts', 'apps/web/src/app/home-preview.generated.module.css',
    'apps/web/src/app/about/about-preview.generated.module.css', 'apps/web/src/app/schools/school-atlases.generated.ts',
    'apps/web/src/app/schools/school-atlas-positions.module.css',
  ];
  let calls = 0;
  const generate = async () => { calls++; for (const file of outputs) await write(file, 'generated output'); };
  try {
    for (const file of ['package.json', 'package-lock.json', 'apps/web/package.json',
      'scripts/images/generate-static-assets.mjs', 'scripts/images/generate-responsive.mjs',
      'scripts/images/school-atlases.mjs', 'scripts/images/generation-cache.mjs',
      'apps/web/src/app/schools/partners.ts', 'apps/web/public/images/source.webp']) await write(file, 'source');
    assert.equal(await withStaticImageCache(root, generate), 'generated');
    assert.equal(await withStaticImageCache(root, generate), 'reused');
    assert.equal(calls, 1);
    for (const file of ['apps/web/public/images/source.webp', 'scripts/images/school-atlases.mjs', 'package-lock.json', outputs[0], outputs[2]]) {
      await write(file, 'changed');
      assert.equal(await withStaticImageCache(root, generate), 'generated', file);
    }
    await rm(path.join(root, outputs[1]));
    assert.equal(await withStaticImageCache(root, generate), 'generated');
    await write('apps/web/public/images/new-source.webp', 'new source');
    await assert.rejects(withStaticImageCache(root, async () => { throw Error('generator failed'); }), /generator failed/);
    await assert.rejects(readFile(path.join(root, 'apps/web/.cache/static-assets.json')), { code: 'ENOENT' });
    assert.equal(await withStaticImageCache(root, generate), 'generated');
    await write('apps/web/public/images/new-source.webp', 'changed again');
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const pending = withStaticImageCache(root, async () => { entered(); await gate; await generate(); });
    await started;
    try { await assert.rejects(withStaticImageCache(root, generate), /already running/); }
    finally { release(); }
    await pending;
    await write('apps/web/public/images/new-source.webp', 'before');
    await assert.rejects(withStaticImageCache(root, async () => { await generate(); await write('apps/web/public/images/new-source.webp', 'during'); }), /inputs changed/);
    assert.equal(await withStaticImageCache(root, generate), 'generated');
    assert.equal(await withStaticImageCache(root, generate), 'reused');
    let published = 0;
    for (const changed of [true, false]) {
      if (changed) await write('apps/web/public/images/new-source.webp', 'publish boundary');
      await withStaticImageCache(root, generate, async () => {
        published++;
        await assert.rejects(withStaticImageCache(root, generate), /already running/);
      });
    }
    assert.equal(published, 2, 'Shell publication runs under the lock on cache miss and hit');
  } finally { await rm(root, { recursive: true, force: true }); }
});
