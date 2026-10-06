import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';

// Only verified content-addressed public assets may receive immutable caching.
// Mutable legacy URLs and page/cache responses retain their existing policy.
export async function immutablePublicAssetHeaders(publicRoot) {
  const directories = ['images', 'icons', 'fonts'];
  const extensions = 'webp|png|jpe?g|svg|woff2|ico';
  async function visit(directory) {
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('Immutable assets cannot be symlinks.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Immutable assets cannot be symlinks.');
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        const match = entry.name.match(/\.([a-f0-9]{12})\.(?:webp|png|jpe?g|svg|woff2|ico)$/);
        if (!match) continue;
        if (createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 12) !== match[1]) {
          throw new Error(`Immutable asset digest mismatch: ${path.relative(publicRoot, file)}`);
        }
      }
    }
  }
  for (const directory of directories) await visit(path.join(publicRoot, directory));
  return directories.map(directory => ({
    source: `/${directory}/:asset(.+\\.[a-f0-9]{12}\\.(?:${extensions}))`,
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
  }));
}
