# LiLink PWA Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LiLink web app installable to the iOS and Android home screen as a standalone PWA with branded icons and a basic offline fallback.

**Architecture:** Use Next.js 16 App Router file conventions for the manifest, add Apple web-app metadata to the root layout, ship a dependency-free service worker (registered only in production) backed by a branded offline page, and generate static PNG icons from a vector source via `sharp`. No third-party PWA library.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, `sharp` (icon generation), vanilla Service Worker API.

---

## File Structure

Create:
- `apps/web/src/app/manifest.ts` — web app manifest (Next file convention).
- `apps/web/src/app/_components/ServiceWorkerRegistrar.tsx` — client component registering `/sw.js` in production.
- `apps/web/public/icons/icon.svg` — canonical vector artwork (committed source).
- `apps/web/public/icons/*.png` — generated icons (committed output).
- `apps/web/public/sw.js` — service worker (offline fallback + install criteria).
- `apps/web/public/offline.html` — branded offline fallback page.
- `apps/web/scripts/generate-pwa-icons.mjs` — sharp-based icon generator.

Modify:
- `apps/web/src/app/layout.tsx` — add `appleWebApp` + `icons` metadata, mount registrar.
- `apps/web/package.json` — add `pwa:icons` script.

---

## Task 1: Icon generator + branded icons

**Files:**
- Create: `apps/web/scripts/generate-pwa-icons.mjs`
- Create: `apps/web/public/icons/icon.svg`
- Modify: `apps/web/package.json`
- Output: `apps/web/public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512,apple-touch-icon}.png`

- [ ] **Step 1: Write the icon generator script**

`apps/web/scripts/generate-pwa-icons.mjs`:

```js
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
  // Base design box (the glyph) is ~520 wide x 420 tall, centered.
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
```

- [ ] **Step 2: Add the npm script**

In `apps/web/package.json` `scripts`, add:

```json
"pwa:icons": "node scripts/generate-pwa-icons.mjs"
```

- [ ] **Step 3: Generate the icons**

Run: `cd apps/web && npm run pwa:icons`
Expected: prints `wrote icons/...` for icon-192, icon-512, icon-maskable-192, icon-maskable-512, apple-touch-icon; `public/icons/` contains 5 PNGs + `icon.svg`.

- [ ] **Step 4: Verify the PNG dimensions**

Run: `cd apps/web && node -e "const s=require('sharp');for(const f of ['icon-192','icon-512','icon-maskable-192','icon-maskable-512','apple-touch-icon']){s('public/icons/'+f+'.png').metadata().then(m=>console.log(f,m.width+'x'+m.height,'alpha='+m.hasAlpha))}"`
Expected: 192x192, 512x512, 192x192, 512x512, 180x180; maskable + apple report `alpha=false`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/generate-pwa-icons.mjs apps/web/public/icons apps/web/package.json
git commit -m "feat(web): generate branded PWA icons"
```

---

## Task 2: Web app manifest

**Files:**
- Create: `apps/web/src/app/manifest.ts`

- [ ] **Step 1: Write the manifest**

`apps/web/src/app/manifest.ts`:

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LiLink · 校园里的，认真相遇",
    short_name: "LiLink",
    description:
      "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f1ea",
    theme_color: "#f4f1ea",
    lang: "zh-CN",
    dir: "ltr",
    categories: ["social", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx next typegen && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/manifest.ts
git commit -m "feat(web): add PWA web app manifest"
```

---

## Task 3: Offline fallback page + service worker

**Files:**
- Create: `apps/web/public/offline.html`
- Create: `apps/web/public/sw.js`

- [ ] **Step 1: Write the offline page**

`apps/web/public/offline.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>离线 · LiLink</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f4f1ea;
        color: #5d2330;
      }
      .card { max-width: 360px; text-align: center; }
      .glyph {
        width: 72px; height: 72px; margin: 0 auto 20px;
        display: grid; place-items: center;
        border-radius: 20px; color: #fff7ee;
        font-weight: 700; font-size: 28px; letter-spacing: 0.02em;
        background: linear-gradient(135deg, #c8756a 0%, #8b3a4a 100%);
        box-shadow: 0 6px 18px rgba(139, 58, 74, 0.26);
      }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 0 0 24px; color: #6b5b50; line-height: 1.6; font-size: 14px; }
      button {
        appearance: none; border: 0; cursor: pointer;
        padding: 12px 28px; border-radius: 999px;
        background: #8b3a4a; color: #fff7ee; font-size: 15px; font-weight: 600;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="glyph">Li</div>
      <h1>当前处于离线状态</h1>
      <p>无法连接到 LiLink。请检查你的网络后重试。</p>
      <button onclick="location.reload()">重试</button>
    </div>
  </body>
</html>
```

- [ ] **Step 2: Write the service worker**

`apps/web/public/sw.js`:

```js
// LiLink PWA service worker: minimal offline fallback + installability.
// Bump CACHE when offline assets change.
const CACHE = "lilink-pwa-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to cached offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res ?? Response.error()),
      ),
    );
    return;
  }

  // Static icons: cache-first.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
  }
});
```

- [ ] **Step 3: Lint the new JS/HTML does not break web lint**

Run: `cd apps/web && npx eslint public/sw.js || echo "eslint did not target public (expected)"`
Expected: either passes or eslint reports it does not lint `public/` — both acceptable; `public/` is outside the Next eslint scope.

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/sw.js apps/web/public/offline.html
git commit -m "feat(web): add service worker and offline fallback page"
```

---

## Task 4: Service worker registration + Apple metadata

**Files:**
- Create: `apps/web/src/app/_components/ServiceWorkerRegistrar.tsx`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write the registrar client component**

`apps/web/src/app/_components/ServiceWorkerRegistrar.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker in production only. Registering in dev
 * (Turbopack) causes stale-cache confusion, so it is intentionally skipped.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failures are non-fatal; the app still works online.
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
```

- [ ] **Step 2: Wire metadata + registrar into the root layout**

In `apps/web/src/app/layout.tsx`:

Add the import near the other app imports:

```tsx
import { ServiceWorkerRegistrar } from "./_components/ServiceWorkerRegistrar";
```

Extend the `metadata` export (keep existing `title`/`description`) to:

```tsx
export const metadata: Metadata = {
  title: "LiLink · 校园里的，认真相遇",
  description:
    "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
  appleWebApp: {
    capable: true,
    title: "LiLink",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};
```

Mount the registrar inside `<body>`, just after `<AnnouncementDialog />`:

```tsx
        <AnnouncementDialog />
        <ServiceWorkerRegistrar />
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx next typegen && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/_components/ServiceWorkerRegistrar.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): register service worker and add Apple web-app metadata"
```

---

## Task 5: Build + end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Build shared then web**

Run (from repo root): `npm run build:shared && cd apps/web && NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1 npm run build`
Expected: build succeeds; output lists `/manifest.webmanifest` route.

- [ ] **Step 2: Start the production server**

Run: `cd apps/web && NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1 PORT=3100 npm run start` (background)
Expected: server listening on :3100.

- [ ] **Step 3: Verify PWA endpoints + head tags**

Use Playwright (or curl) against `http://localhost:3100`:
- `GET /manifest.webmanifest` → 200, JSON has `display: "standalone"`, 4 icons, `start_url: "/"`.
- `GET /sw.js` → 200, `content-type` JavaScript.
- `GET /offline.html` → 200.
- `GET /icons/icon-512.png` → 200, `content-type: image/png`.
- Home `/` `<head>` contains `link[rel="manifest"]`, `link[rel="apple-touch-icon"]`, `meta[name="apple-mobile-web-app-capable"][content="yes"]`, `meta[name="apple-mobile-web-app-title"][content="LiLink"]`.

Expected: all assertions pass.

- [ ] **Step 4: Stop the server**

Stop the background `npm run start` process.

---

## Self-Review notes

- **Spec coverage:** manifest (Task 2), icons (Task 1), Apple metadata (Task 4), service worker + offline page (Task 3), registration (Task 4), verification (Task 5). All spec sections covered.
- **Type consistency:** icon filenames are identical across the generator (Task 1), manifest (Task 2), sw precache (Task 3), and layout metadata (Task 4): `icon-192`, `icon-512`, `icon-maskable-192`, `icon-maskable-512`, `apple-touch-icon`.
- **Sharp SVG fallback:** if `sharp` cannot rasterize SVG in this environment, switch the generator to render via `next/og` `ImageResponse`; filenames/sizes stay identical so downstream tasks are unaffected.
