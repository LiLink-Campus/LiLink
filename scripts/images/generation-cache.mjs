import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const inputs = ['package.json', 'package-lock.json', 'apps/web/package.json',
  'scripts/images/generate-static-assets.mjs', 'scripts/images/generation-cache.mjs',
  'scripts/images/generate-responsive.mjs', 'scripts/images/school-atlases.mjs',
  'apps/web/src/app/schools/partners.ts', 'apps/web/public/images'];
const outputs = ['apps/web/public/images/responsive', 'apps/web/public/images/school-atlases',
  'apps/web/src/lib/static-image-manifest.ts', 'apps/web/src/app/home-preview.generated.module.css',
  'apps/web/src/app/about/about-preview.generated.module.css', 'apps/web/src/app/schools/school-atlases.generated.ts',
  'apps/web/src/app/schools/school-atlas-positions.module.css'];
const hash = value => createHash('sha256').update(value).digest('hex');
async function fingerprint(root, files, excluded = []) {
  const entries = [];
  async function visit(file) {
    if (excluded.includes(file)) return;
    const target = path.join(root, file);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw Error(`Static image inputs and outputs must not be symlinks: ${file}`);
    if (stat.isDirectory()) {
      for (const entry of (await readdir(target)).sort()) await visit(`${file}/${entry}`);
    } else entries.push([file, hash(await readFile(target))]);
  }
  for (const file of files) await visit(file);
  return hash(JSON.stringify(entries));
}
const inputFingerprint = async root => hash(JSON.stringify({
  node: process.version, platform: process.platform, arch: process.arch,
  libc: process.report.getReport().header.glibcVersionRuntime ?? null,
  sharp: sharp.versions, simd: sharp.simd(),
  content: await fingerprint(root, inputs, outputs.slice(0, 2)),
}));
const outputFingerprint = root => fingerprint(root, outputs).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

export async function withStaticImageCache(root, generate, publish = async () => {}) {
  const directory = path.join(root, 'apps/web/.cache');
  const stamp = path.join(directory, 'static-assets.json');
  const lock = path.join(directory, 'static-assets.lock');
  const temporary = `${stamp}.${process.pid}`;
  await mkdir(directory, { recursive: true });
  const handle = await open(lock, 'wx').catch(error => {
    if (error.code === 'EEXIST') throw Error(`Static image generation already running; remove ${lock} only after its process has stopped.`);
    throw error;
  });
  try {
    const before = await inputFingerprint(root);
    const saved = await readFile(stamp, 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    });
    let result = 'reused';
    if (!(saved?.input === before && saved.output && saved.output === await outputFingerprint(root))) {
      await rm(stamp, { force: true });
      await generate();
      if (before !== await inputFingerprint(root)) throw Error('Static image inputs changed during generation; rerun the build.');
      const output = await outputFingerprint(root);
      if (!output) throw Error('Static image generation did not produce complete outputs.');
      await writeFile(temporary, JSON.stringify({ input: before, output }));
      await rename(temporary, stamp);
      result = 'generated';
    }
    await publish(result);
    return result;
  } finally {
    await handle.close();
    await rm(temporary, { force: true });
    await rm(lock, { force: true });
  }
}
