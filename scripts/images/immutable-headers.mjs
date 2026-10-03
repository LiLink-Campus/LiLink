import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// Only verified content-addressed public assets may receive immutable caching.
// Mutable legacy URLs and page/cache responses retain their existing policy.
export async function immutablePublicAssetHeaders(publicRoot) {
  const files = [];
  async function visit(directory) {
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
        files.push(`/${path.relative(publicRoot, file).split(path.sep).join('/')}`);
      }
    }
  }
  for (const directory of ['images', 'icons', 'fonts']) await visit(path.join(publicRoot, directory));
  return files.sort().map(source => ({ source,
    headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
  }));
}
