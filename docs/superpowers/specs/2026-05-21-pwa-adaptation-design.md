# LiLink PWA 适配设计

- 日期：2026-05-21
- 分支：`worktree-pwa`（以 `main` / `origin/main` `03b91a5` 为起点）
- 作用范围：`apps/web`（Next.js 16 App Router + Tailwind 4，部署于 Vercel）

## 目标

让 LiLink 网站在 **iOS Safari** 与 **Android Chrome** 上都能“添加 / 安装到主屏幕”，以
**独立全屏 app 形态**（`display: standalone`，无浏览器地址栏）打开，并具备**基础离线兜底**。

成功标准：

- Android Chrome 满足可安装条件（manifest 合规 + 注册了带 `fetch` handler 的 Service Worker），出现“安装应用”提示。
- iOS Safari 通过“分享 → 添加到主屏幕”后，使用品牌图标、以独立形态打开。
- 断网访问导航请求时返回品牌化离线兜底页，而非浏览器默认错误页。
- web `typecheck` / `build` 通过；现有页面观感与行为不回归。

## 非目标（YAGNI）

- 多尺寸 iOS 启动图（splash startup images）。
- 完整离线缓存策略（页面/接口数据离线可用）。
- 应用内“安装”引导按钮 / `beforeinstallprompt` 自定义 UI。
- 推送通知（Web Push）。

## 现状（基于 main）

- `apps/web` 无 `public/` 目录；favicon 走 App Router 文件约定（`src/app/favicon.ico`）。
- `src/app/layout.tsx` 已导出 `metadata`（title/description）与 `viewport`（`themeColor: "#f4f1ea"`、`viewportFit: "cover"`）。
- 品牌主色：酒红 `#8b3a4a`（“黎安”识别色，见 `globals.css`）；背景米色 `#f4f1ea`。品牌标识 `brand-mark.tsx` 为纯 CSS 的酒红圆角牌 + “Li” 字样，无任何图片素材。
- `sharp` 可解析、`next/og` 内置；Node 22。

## 设计

### 1. Web App Manifest — `apps/web/src/app/manifest.ts`

使用 Next App Router 的 `manifest.ts` 文件约定（自动注入 `<link rel="manifest" href="/manifest.webmanifest">`），导出默认函数返回 `MetadataRoute.Manifest`：

| 字段 | 值 |
| --- | --- |
| `name` | `LiLink · 校园里的，认真相遇` |
| `short_name` | `LiLink` |
| `description` | 复用 `metadata.description` 文案 |
| `id` / `start_url` / `scope` | `/` |
| `display` | `standalone` |
| `orientation` | `portrait` |
| `background_color` | `#f4f1ea` |
| `theme_color` | `#f4f1ea`（与现有 `viewport.themeColor` 保持一致，不改变现有浏览器观感） |
| `lang` | `zh-CN` |
| `dir` | `ltr` |
| `categories` | `["social", "lifestyle"]` |
| `icons` | 192/512（`purpose: "any"`）+ 192/512（`purpose: "maskable"`），均指向 `/icons/*.png` |

### 2. 应用图标 — 静态 PNG（sharp 从主 SVG 生成）

- 新建主图标源 `apps/web/public/icons/icon.svg`：酒红 `#8b3a4a` 圆角方牌 + 米/白 “Li” 字样，沿用 brand-glyph 视觉。
- `maskable` 版本预留约 20% 安全边距（圆形/圆角裁切下主体不被裁掉），并使用不透明背景。
- 生成脚本 `apps/web/scripts/generate-pwa-icons.mjs`（用 `sharp` 将 SVG 栅格化）产出至 `apps/web/public/icons/`：
  - `icon-192.png`、`icon-512.png`（`any`，可透明）
  - `icon-maskable-192.png`、`icon-maskable-512.png`（不透明 + 安全区）
  - `apple-touch-icon.png`（180×180，**不透明**，iOS 主屏图标）
- 在 `apps/web/package.json` 增加脚本（如 `"pwa:icons"`）便于重生成；生成的 PNG 与 SVG 源一并提交入库。
- 兼容性兜底：若 `sharp` 无法栅格化 SVG，则脚本改用 `next/og` 的 `ImageResponse` 等价渲染路径（实现时确认，二选一）。

### 3. iOS / Apple 元信息 — `src/app/layout.tsx`

在现有 `metadata` 上补充（不改动 `viewport`）：

- `metadata.appleWebApp = { capable: true, title: "LiLink", statusBarStyle: "default" }`
  - 注入 `apple-mobile-web-app-capable` / `mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style` / `apple-mobile-web-app-title`。
- `metadata.icons = { apple: "/icons/apple-touch-icon.png", icon: [...]? }`（apple-touch-icon 必需；其余图标主要由 manifest 提供）。
- 保留现有 `viewport.viewportFit: "cover"`（适配刘海 / 安全区）。

### 4. Service Worker — `apps/web/public/sw.js`

轻量原生 SW（无第三方库，避免 Turbopack/next-pwa 兼容问题）：

- `install`：`caches.open(CACHE)` 预缓存离线兜底页 `/offline.html` 及关键静态资源，`self.skipWaiting()`。
- `activate`：删除非当前版本缓存（`CACHE` 含版本号），`clients.claim()`。
- `fetch`：
  - 仅处理同源 `GET`。
  - 导航请求（`request.mode === "navigate"`）：network-first，失败回退缓存或 `/offline.html`。
  - 静态资源（`/icons/`、`_next/static` 等）：cache-first / stale-while-revalidate。
  - 其余（API 等跨域/非 GET）：直接走网络，不拦截。
- 带 `fetch` handler 即满足 Android 自动安装提示的“有 service worker”条件。
- 版本化：顶部 `const CACHE = "lilink-pwa-v1";`，升级缓存时改版本号。

离线兜底页 `apps/web/public/offline.html`：自包含、品牌化（酒红/米色）、含“重试”按钮的极简静态页。

### 5. Service Worker 注册 — 客户端组件

- 新增 `apps/web/src/app/_components/ServiceWorkerRegistrar.tsx`（`"use client"`）：`useEffect` 内在 `navigator.serviceWorker` 可用且 `process.env.NODE_ENV === "production"` 时注册 `/sw.js`。
  - 仅生产注册，避免本地 `next dev`（Turbopack）下的缓存困扰；本地验证用 `next build && next start`。
- 在 `layout.tsx` 的 `<body>` 内挂载该组件。

## 文件改动清单

新增：

- `apps/web/src/app/manifest.ts`
- `apps/web/src/app/_components/ServiceWorkerRegistrar.tsx`
- `apps/web/public/icons/icon.svg`（+ 生成的 PNG）
- `apps/web/public/sw.js`
- `apps/web/public/offline.html`
- `apps/web/scripts/generate-pwa-icons.mjs`
- `docs/superpowers/specs/2026-05-21-pwa-adaptation-design.md`（本文件）

修改：

- `apps/web/src/app/layout.tsx`（补 `appleWebApp` / `icons`，挂载注册组件）
- `apps/web/package.json`（加 `pwa:icons` 脚本）

## 验证计划

1. 构建：根目录 `npm run build:shared` → `apps/web` `typecheck` 与 `build` 通过。
2. 图标：运行 `pwa:icons`，确认 `public/icons/` 产物尺寸/数量正确。
3. 运行：`next build && next start`，用 Playwright 校验：
   - `GET /manifest.webmanifest` 返回 200，关键字段正确。
   - `GET /sw.js`、`/offline.html`、`/icons/icon-512.png` 返回 200。
   - 首页 `<head>` 含 `link[rel=manifest]`、`link[rel=apple-touch-icon]`、`meta[name=apple-mobile-web-app-capable]`。
   - `navigator.serviceWorker.controller` / 注册成功（生产构建下）。
4. 现有页面冒烟：首页与 dashboard 正常渲染，无控制台报错回归。

## 协作

- 实现完成后由 **Codex** 作为评审伙伴 review 代码（`codex:rescue`），按反馈修正。
- 自主推进，无需逐步征询用户确认。

## 部署备注

- `output: "standalone"` 下 Vercel 正常托管 `public/`；`/sw.js` 默认作用域 `/`，无需额外 `Service-Worker-Allowed` 头。
