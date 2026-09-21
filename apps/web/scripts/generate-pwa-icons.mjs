// Generate browser and install icons from the canonical dove artwork.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");
const source = await readFile(path.join(outDir, "icon.svg"), "utf8");
if (/<image\b|data:image\//i.test(source)) {
  throw new Error("The logo must contain vector artwork only.");
}
const body = source.replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 256 256" fill="none" role="img" aria-labelledby="logo-title logo-description">
  <rect width="256" height="256" fill="#faf9f3"/>
  <g transform="translate(44.8 44.8) scale(.65)">${body}</g>
</svg>\n`;
await writeFile(path.join(outDir, "icon-maskable.svg"), maskable);
for (const [name, size, artwork] of [
  ["favicon-32.png", 32, source],
  ["icon-192.png", 192, source],
  ["icon-512.png", 512, source],
  ["apple-touch-icon.png", 180, maskable],
  ["icon-maskable-192.png", 192, maskable],
  ["icon-maskable-512.png", 512, maskable],
]) {
  await sharp(Buffer.from(artwork), { density: 192 })
    .resize(size, size)
    .flatten({ background: "#faf9f3" })
    .png()
    .toFile(path.join(outDir, name));
}
const frames = await Promise.all([16, 32, 48].map(async (size) => ({
  size,
  png: await sharp(Buffer.from(source), { density: 192 })
    .resize(size, size)
    .png()
    .toBuffer(),
})));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
for (const [index, { size, png }] of frames.entries()) {
  const entry = 6 + index * 16;
  header[entry] = size;
  header[entry + 1] = size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
await writeFile(path.join(outDir, "../favicon.ico"), Buffer.concat([header, ...frames.map(({ png }) => png)]));
console.log("Updated SVG, PNG and ICO brand icons from icons/icon.svg.");
