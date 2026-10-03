import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Read pristine masters, never recursively recompress the published WebP files.
const args = process.argv.slice(2);
if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--output') {
  throw new Error('Usage: node scripts/images/compress-assets.mjs --source <original-public> --output <empty-directory>');
}
const sourceRoot = path.resolve(args[1]);
const outputRoot = path.resolve(args[3]);
if (sourceRoot === outputRoot || outputRoot.startsWith(`${sourceRoot}${path.sep}`)) {
  throw new Error('Output must be separate from the original assets.');
}
await mkdir(outputRoot, { recursive: true });
if ((await readdir(outputRoot)).length) throw new Error('Output must be empty.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
async function visit(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error('Image symlinks are not allowed.');
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await visit(absolute);
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) files.push(path.relative(sourceRoot, absolute));
  }
}
await visit(path.join(sourceRoot, 'images'));
const report = { versions: sharp.versions, assets: [], sourceBytes: 0, outputBytes: 0 };
const published = new Map();
for (const file of files) {
  const source = await readFile(path.join(sourceRoot, file));
  const metadata = await sharp(source).metadata();
  if ((metadata.pages ?? 1) > 1) throw new Error(`Animated asset needs a separate policy: ${file}`);
  const qr = file.startsWith('images/social/');
  const logo = file.startsWith('images/schools/');
  const portrait = file.startsWith('images/about/') && !file.includes('watercolor-atlas');
  const resize = qr ? null : logo ? { width: 576, height: 256 } : portrait ? { width: 336, height: 336 } : null;
  const options = qr ? { lossless: true, effort: 6 } : {
    quality: logo ? 75 : portrait ? 65 : 60,
    effort: 6, alphaQuality: 100, smartSubsample: true,
  };
  let pipeline = sharp(source).rotate();
  if (resize) pipeline = pipeline.resize({ ...resize, fit: 'inside', withoutEnlargement: true });
  const targetPixels = await pipeline.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelHash = hash(Buffer.concat([
    Buffer.from(JSON.stringify({ width: targetPixels.info.width, height: targetPixels.info.height, options })),
    targetPixels.data,
  ]));
  // The atlas PNG and old lossless WebP encode exactly the same artwork.
  let output = published.get(pixelHash);
  if (!output) {
    let encoded = await pipeline.webp(options).toBuffer();
    if (!resize && metadata.format === 'webp' && encoded.length > source.length) encoded = source;
    const base = file.replace(/(?:\.[a-f0-9]{12,64})?\.(png|jpe?g|webp)$/i, '');
    const name = `${base}.${hash(encoded).slice(0, 12)}.webp`;
    await mkdir(path.dirname(path.join(outputRoot, name)), { recursive: true });
    await writeFile(path.join(outputRoot, name), encoded, { flag: 'wx' });
    const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alphaEqual = decoded.info.width === targetPixels.info.width && decoded.info.height === targetPixels.info.height
      && decoded.data.every((value, index) => index % 4 !== 3 || value === targetPixels.data[index]);
    if (!alphaEqual || (qr && !decoded.data.equals(targetPixels.data))) throw new Error(`Pixel contract failed: ${file}`);
    output = { file: name, bytes: encoded.length, sha256: hash(encoded), width: decoded.info.width, height: decoded.info.height, alphaEqual, losslessPixels: decoded.data.equals(targetPixels.data) };
    published.set(pixelHash, output);
    report.outputBytes += encoded.length;
  }
  report.sourceBytes += source.length;
  let preview;
  if (qr) {
    // Keep the downloadable original lossless; deliver a small fixed-size preview.
    const encoded = await sharp(source).resize({ width: 320, withoutEnlargement: true })
      .webp({ quality: 75, effort: 6, smartSubsample: true }).toBuffer();
    const name = `${file.replace(/\.[^.]+$/, '')}-preview.${hash(encoded).slice(0, 12)}.webp`;
    await writeFile(path.join(outputRoot, name), encoded, { flag: 'wx' });
    const size = await sharp(encoded).metadata();
    preview = { file: name, bytes: encoded.length, sha256: hash(encoded), width: size.width, height: size.height };
    report.outputBytes += encoded.length;
  }
  report.assets.push({ source: file, sourceBytes: source.length, sourceSha256: hash(source), sourceWidth: metadata.width, sourceHeight: metadata.height, policy: { resize, webp: options }, output, ...(preview ? { preview } : {}) });
}
report.outputCount = published.size + report.assets.filter(asset => asset.preview).length;
report.reductionPercent = (1 - report.outputBytes / report.sourceBytes) * 100;
await writeFile(path.join(outputRoot, 'compression-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ sourceCount: files.length, outputCount: report.outputCount, sourceBytes: report.sourceBytes, outputBytes: report.outputBytes, reductionPercent: report.reductionPercent }));
