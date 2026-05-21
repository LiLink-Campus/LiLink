// Generates LiLink PWA icons from a vector "Li" wordmark using sharp.
// Vector paths are used (no <text>) so rasterization needs no installed fonts.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../public/icons");

// Brand colors (see apps/web/src/app/globals.css).
const ACCENT = "#c8756a"; // --accent
const PRIMARY = "#8b3a4a"; // --primary
const INK = "#fff7ee"; // --fg-onPrimary

// Draw the "Li" mark inside a unit square [0,1000], scaled+centered by `scale`.
// Returns SVG fragment string. The mark is built from rects + a dot ("i").
function liMark(scale) {
  const S = 1000;
  const c = S / 2;
  // Base design box (the glyph) is ~520 wide x 440 tall, centered.
  const w = 520 * scale;
  const h = 440 * scale;
  const x0 = c - w / 2;
  const y0 = c - h / 2;
  const stroke = 86 * scale; // bar thickness
  // "L": vertical bar + bottom foot.
  const lx = x0;
  const lTop = y0;
  const lBottom = y0 + h;
  const footW = 232 * scale;
  // "i": stem + dot, placed to the right of L.
  const ix = x0 + 300 * scale;
  const iStemTop = y0 + 150 * scale;
  const dotR = 52 * scale;
  const dotCx = ix + stroke / 2;
  const dotCy = y0 + 56 * scale;
  return `
    <g fill="${INK}">
      <rect x="${lx}" y="${lTop}" width="${stroke}" height="${h}" rx="${stroke / 2}" />
      <rect x="${lx}" y="${lBottom - stroke}" width="${footW}" height="${stroke}" rx="${stroke / 2}" />
      <rect x="${ix}" y="${iStemTop}" width="${stroke}" height="${lBottom - iStemTop}" rx="${stroke / 2}" />
      <circle cx="${dotCx}" cy="${dotCy}" r="${dotR}" />
    </g>`;
}

// Build a full icon SVG. `rounded` controls corner radius (any vs maskable/apple).
function iconSvg({ rounded, glyphScale, sparkle }) {
  const S = 1000;
  const radius = rounded ? 230 : 0;
  const sparkleEl = sparkle
    ? `<circle cx="710" cy="300" r="40" fill="${INK}" opacity="0.85" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="LiLink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}" />
      <stop offset="1" stop-color="${PRIMARY}" />
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${radius}" ry="${radius}" fill="url(#bg)" />
  ${liMark(glyphScale)}
  ${sparkleEl}
</svg>`;
}

async function render(svg, size, file, { opaque }) {
  let img = sharp(Buffer.from(svg), { density: 384 }).resize(size, size);
  if (opaque) {
    img = img.flatten({ background: PRIMARY });
  }
  await img.png().toFile(path.join(outDir, file));
  console.log(`wrote icons/${file} (${size}x${size})`);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  // Canonical committed source: the rounded "any" artwork.
  const sourceSvg = iconSvg({ rounded: true, glyphScale: 1, sparkle: true });
  await writeFile(path.join(outDir, "icon.svg"), sourceSvg + "\n", "utf8");

  // any: rounded plaque.
  const anySvg = iconSvg({ rounded: true, glyphScale: 1, sparkle: true });
  await render(anySvg, 192, "icon-192.png", { opaque: false });
  await render(anySvg, 512, "icon-512.png", { opaque: false });

  // maskable: full-bleed square, glyph shrunk into ~66% safe zone.
  const maskSvg = iconSvg({ rounded: false, glyphScale: 0.66, sparkle: false });
  await render(maskSvg, 192, "icon-maskable-192.png", { opaque: true });
  await render(maskSvg, 512, "icon-maskable-512.png", { opaque: true });

  // apple-touch: full-bleed square (iOS rounds it), opaque, larger glyph.
  const appleSvg = iconSvg({ rounded: false, glyphScale: 0.92, sparkle: true });
  await render(appleSvg, 180, "apple-touch-icon.png", { opaque: true });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
