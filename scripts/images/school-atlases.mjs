import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Contract: keep all 28 names, aspect ratios, alpha, and display bounds; no runtime optimizer.
// Failure boundary: a second-row mark can be LCP; its sheet must not carry later rows.
// Four groups preserve rows; the first two rows have dedicated sheets at unchanged DPR/quality.
// Groups share native lazy-loaded images. Failed images retain alt and school headings.
const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--report' || !args[1])) {
  throw new Error('Usage: node scripts/images/school-atlases.mjs [--report <path>]');
}
const reportPath = args.length === 2 ? path.resolve(args[1]) : null;
const root = path.resolve(import.meta.dirname, '../..');
const schoolRoot = path.join(root, 'apps/web/src/app/schools');
const publicRoot = path.join(root, 'apps/web/public');
const outputRoot = path.join(publicRoot, 'images/school-atlases');
const source = await readFile(path.join(schoolRoot, 'partners.ts'), 'utf8');
const entries = [...source.matchAll(/id: "([^"]+)",[\s\S]*?logo: "([^"]+)"/g)]
  .map((match) => ({ id: match[1], file: match[2] }));
const chineseIds = ['bupt', 'cuc', 'uestc', 'bsu', 'muc', 'blcu', 'tju', 'cupl', 'cugb', 'nefu', 'xjtu'];
const reversedIds = ['qmul', 'glasgow', 'reading', 'aberdeen', 'bcu'];
if (entries.length !== 28 || new Set(entries.map((entry) => entry.id)).size !== 28) {
  throw new Error('Expected 28 distinct partner logos; review the atlas grouping when partners change.');
}
const boundaries = ['cuc', 'uestc', 'tju'].map((id) => entries.findIndex((entry) => entry.id === id));
if (boundaries.some((boundary, index) => boundary < 1 || (index > 0 && boundary <= boundaries[index - 1]))) {
  throw new Error('School atlas cooperation-row boundaries are missing or out of order.');
}
const cuts = [0, ...boundaries, entries.length];
const groups = cuts.slice(0, -1).map((start, index) => entries.slice(start, cuts[index + 1]));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const maxColumns = 4;
const cell = { width: 194, height: 84, padding: 2 };
const maxDpr = 3;
const manifest = { version: 1, atlases: {}, logos: {} };
const report = { sharp: sharp.versions.sharp, assets: [], variants: [] };
const positions = [];
const percent = (value) => `${Number((value * 100).toFixed(6))}%`;
await mkdir(outputRoot, { recursive: true });

for (const [groupIndex, logos] of groups.entries()) {
  const group = `partners-${groupIndex + 1}`;
  const columns = Math.min(maxColumns, logos.length);
  const width = columns * cell.width;
  const height = Math.ceil(logos.length / columns) * cell.height;
  const composite = [];
  for (const [index, logo] of logos.entries()) {
    if (path.basename(logo.file) !== logo.file || !/\.(webp|svg)$/.test(logo.file)) {
      throw new Error(`Invalid logo source: ${logo.id}`);
    }
    const bytes = await readFile(path.join(publicRoot, 'images/schools', logo.file));
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error(`Invalid logo dimensions: ${logo.id}`);
    }
    const chinese = chineseIds.includes(logo.id);
    const bounds = chinese ? { width: 76, height: 76 } : { width: 190, height: 64 };
    const rendered = await sharp(bytes, { density: metadata.format === 'svg' ? 216 : 72 })
      .resize({ width: bounds.width * maxDpr, height: bounds.height * maxDpr, fit: 'inside' })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Bake the existing monochrome treatment instead of filtering the whole atlas at runtime.
    if (reversedIds.includes(logo.id)) {
      for (let pixel = 0; pixel < rendered.data.length; pixel += 4) {
        rendered.data[pixel] = rendered.data[pixel + 1] = rendered.data[pixel + 2] = 0;
        rendered.data[pixel + 3] = Math.round(rendered.data[pixel + 3] * 0.72);
      }
    }
    const x = (index % columns) * cell.width + cell.padding;
    const y = Math.floor(index / columns) * cell.height + cell.padding;
    composite.push({ input: rendered.data, raw: rendered.info, left: x * maxDpr, top: y * maxDpr });
    manifest.logos[logo.id] = {
      group, x, y, width: rendered.info.width / maxDpr, height: rendered.info.height / maxDpr,
    };
    const cropWidth = rendered.info.width / maxDpr;
    const cropHeight = rendered.info.height / maxDpr;
    positions.push(`.${logo.id} {\n  --logo-ratio: ${Number((cropWidth / cropHeight).toFixed(8))};\n`
      + `  --atlas-width: ${percent(width / cropWidth)};\n  --atlas-left: ${percent(-x / cropWidth)};\n`
      + `  --atlas-top: ${percent(-y / cropHeight)};\n}`);
    report.assets.push({ id: logo.id, source: logo.file, sourceSha256: hash(bytes),
      sourceWidth: metadata.width, sourceHeight: metadata.height, alpha: metadata.hasAlpha });
  }
  const pixels = await sharp({ create: {
    width: width * maxDpr, height: height * maxDpr, channels: 4, background: '#00000000',
  } }).composite(composite).png().toBuffer();
  const variants = [];
  for (const dpr of [1, 2, 3]) {
    const bytes = await sharp(pixels).resize(width * dpr, height * dpr)
      .webp({ quality: 75, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer();
    const file = `${group}-${dpr}x.${hash(bytes).slice(0, 12)}.webp`;
    await writeFile(path.join(outputRoot, file), bytes);
    variants.push({ dpr, src: `/images/school-atlases/${file}` });
    report.variants.push({ group, dpr, bytes: bytes.length, width: width * dpr,
      height: height * dpr, sha256: hash(bytes) });
  }
  manifest.atlases[group] = { width, height, variants };
}

await writeFile(path.join(schoolRoot, 'school-atlases.generated.ts'),
  `const schoolAtlases = ${JSON.stringify(manifest, null, 2)} as const;\n\nexport default schoolAtlases;\n`);
await writeFile(path.join(schoolRoot, 'school-atlas-positions.module.css'), `${positions.join('\n')}\n`);
if (reportPath) {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify({
  logos: report.assets.length,
  groups: Object.keys(manifest.atlases).length,
  variants: report.variants.length,
  bytesByDpr: Object.fromEntries([1, 2, 3].map((dpr) => [dpr,
    report.variants.filter((variant) => variant.dpr === dpr).reduce((sum, variant) => sum + variant.bytes, 0),
  ])),
  totalBytes: report.variants.reduce((sum, variant) => sum + variant.bytes, 0),
  ...(reportPath ? { reportWritten: true } : {}),
}));
