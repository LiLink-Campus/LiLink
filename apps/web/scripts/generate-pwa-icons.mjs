// Generate install icons from the canonical dove artwork.
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
  ["icon-192.png", 192, source],
  ["icon-512.png", 512, source],
  ["apple-touch-icon.png", 180, maskable],
  ["icon-maskable-512.png", 512, maskable],
]) {
  await sharp(Buffer.from(artwork), { density: 192 })
    .resize(size, size)
    .flatten({ background: "#faf9f3" })
    .png()
    .toFile(path.join(outDir, name));
}
console.log("Updated SVG and PNG install icons from icons/icon.svg.");
