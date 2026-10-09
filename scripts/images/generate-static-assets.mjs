import path from 'node:path';
import { withStaticImageCache } from './generation-cache.mjs';

// Only Sharp output is reusable; shell versioning must read current handwritten CSS.
const started = Date.now();
await withStaticImageCache(path.resolve(import.meta.dirname, '../..'), async () => {
  await import('./generate-responsive.mjs');
  await import('./school-atlases.mjs');
}, async result => {
  console.log(JSON.stringify({ staticImages: result, durationMs: Date.now() - started }));
  await import('./version-shell-assets.mjs');
});
