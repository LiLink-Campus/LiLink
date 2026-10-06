import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { immutablePublicAssetHeaders } from './immutable-headers.mjs';

// Build boundary failures: published digest tampering or a symlink must abort
// before any headers can be emitted. Fixtures never touch real public assets.
test('configuration rejects changed content addresses and symlink traversal', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lilink-immutable-e2e-'));
  try {
    for (const name of ['images', 'icons', 'fonts']) await mkdir(path.join(root, name));
    const bytes = Buffer.from('synthetic published bytes');
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const file = path.join(root, 'images', `fixture.${hash}.webp`);
    await writeFile(file, bytes);
    await immutablePublicAssetHeaders(root);
    await writeFile(file, 'changed bytes');
    await assert.rejects(immutablePublicAssetHeaders(root), /digest mismatch/);
    await writeFile(file, bytes);
    const linked = path.join(root, 'icons', 'linked.svg');
    await symlink(file, linked);
    await assert.rejects(immutablePublicAssetHeaders(root), /symlinks/);
    await rm(linked);
    await symlink(path.join(root, 'images'), path.join(root, 'fonts', 'linked-directory'));
    await assert.rejects(immutablePublicAssetHeaders(root), /symlinks/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
