// Derive an SVG maskable icon from the canonical, editable dove artwork.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
console.log("Updated icons/icon-maskable.svg from icons/icon.svg. No raster files generated.");
