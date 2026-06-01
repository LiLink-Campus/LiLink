# 将 devlog 集成进 LiLink 主应用 — 设计文档

- 日期：2026-06-01
- 状态：已实现（2026-06-01）
- 涉及仓库：
  - `LiLink`（主应用，`apps/web`，Next.js 16）— 消费侧，改动大头
  - `lilink-devlog`（独立 Astro 站，部署在 `devlog.lilink.top`）— 仅新增一个数据端点

## 1. 背景与目标

devlog（`devlog.lilink.top`）已经是一个独立的 Astro 站点，用面向用户的语言记录每一次产品迭代（meetup 流程、隐私加固、加到主屏、首页改版、邀请码、校园优惠券……）。但它和 LiLink 主应用是割裂的：用户在 LiLink 里看不到「最近更新了什么」，必须知道并主动访问 devlog 才能看到。

**目标**：让 LiLink 的**所有访客**（含未登录者）在主应用内就能很明显地看到「产品在持续更新、更新了什么」，并能一键跳到 devlog 看某条更新的全文。

**非目标**：不在主应用内重渲染 devlog 全文（全文始终留在 devlog）；不嵌 iframe；本期不在 `dashboard` / `admin` 区做露出（聚焦公开侧）。

## 2. 已确认的产品决策

| 维度 | 决策 |
| --- | --- |
| 集成形态 | 站内列出最近更新 + 点击跳转到 devlog 看全文（不外链整站、不 iframe） |
| 受众 | 所有访客（公开侧），不限登录用户 |
| 数据源 | **devlog 新增 `/updates.json` 端点**，主应用服务端 fetch JSON（不在主应用解析 RSS） |
| 入口命名 / 路由 | 导航与页脚显示「更新」，站内页面路由 `/updates`，页面标题「产品更新」 |
| 显眼手段 | ①导航入口 ②首页「最近更新」区块 ③导航入口 NEW 标记 ④页脚链接（四者全要） |

## 3. 架构与数据流

```
lilink-devlog (Astro)
  └─ src/pages/updates.json.ts ──build──> /updates.json   (静态 JSON，已发布的更新)

LiLink web (Next.js, apps/web)
  src/lib/devlog-feed.ts  ── server fetch + ISR(revalidate 3600) ──> 解析为 DevlogUpdate[]
        │
        ├─> 首页 page.tsx：「最近更新」区块（取前 3 条）              [server]
        ├─> /updates 列表页 page.tsx：全部更新                        [server]
        ├─> 导航 site-nav.tsx：「更新」入口 + <UpdatesNewBadge/>       [client]
        │        └─ NEW 标记数据来自同源内部端点 /api/devlog/latest   [server, 复用 lib]
        └─> 页脚 public-chrome.tsx：「更新」链接                       [static]
```

要点：

- 主应用与 devlog 之间是**服务端到服务端**的 fetch（Next 服务端 / Route Handler），不是浏览器跨域请求，因此**不涉及 CORS**。
- 每条更新的「看全文」链接由 `/updates.json` 的 `url` 字段直接给出（devlog 绝对 URL），主应用不拼 URL。
- devlog 更新后，最多 1 小时（ISR `revalidate`）反映到主站。

## 4. devlog 侧改动（lilink-devlog 仓库）

### 4.1 新增 `src/pages/updates.json.ts`

仿照现有 `src/pages/rss.xml.ts` 与 `src/pages/search-index.json.ts` 的模式（说明 Astro 端输出 JSON 已是既有惯例），复用同样的辅助函数：

- `getPublishedPosts()`、`postPath(post)`（来自 `src/lib/posts`）
- `resolveTags(tags)`（来自 `src/lib/tags`）

输出结构（**数据契约**，见 §6）。要点：

- 只输出 `status === "published"` 的帖子（`getPublishedPosts()` 已保证）。
- 按 `publishedAt` 倒序。
- `url`、`cover` 必须是**绝对 URL**（用 `new URL(path, context.site).href` 绝对化；`context.site` 即 `https://devlog.lilink.top`，与 rss.xml.ts 取站点的方式一致）。
- `cover` 为可选；无封面的帖子输出 `cover: null`，由主应用做纯文字卡片降级。
- 条数：默认输出全部已发布更新（当前 7 篇，量很小）。如未来条目变多，可在端点内限制为最近 ~30 条；本期不限制。

### 4.2 不改动 devlog 的其它部分

RSS、sitemap、页面渲染、内容 schema 均不动。新增端点是纯增量。

## 5. 主应用侧改动（apps/web）

### 5.1 数据获取层 `src/lib/devlog-feed.ts`（server-only）

- `export type DevlogUpdate`（见 §6）。
- `getDevlogUpdates(): Promise<DevlogUpdate[]>`：
  - `fetch(`${DEVLOG_BASE_URL}/updates.json`, { next: { revalidate: 3600 } })`。
  - 解析、按 `publishedAt` 倒序（端点已排序，主应用再保险一次）。
  - **容错**：任何失败（网络、超时、非 200、JSON 解析失败）一律 `return []`，并 `console.warn`，绝不抛出。与首页现有 `getLandingPayload().catch(() => null)` 的容错风格一致。
- `getLatestDevlogPublishedAt(): Promise<string | null>`：取首条的 `publishedAt`，供 NEW 标记用（复用上面的结果）。
- 配置：`DEVLOG_BASE_URL`（服务端环境变量），默认 `https://devlog.lilink.top`。无需配置即可在生产工作；本地开发可覆盖。

### 5.2 列表页 `src/app/updates/page.tsx`（server component）

- 标题「产品更新」，一句话副标题（如「我们解决了哪些问题，体验有了什么变化」，与 devlog RSS 描述一致）。
- 渲染 `getDevlogUpdates()` 的全部条目：每条显示日期、标题、摘要、标签；点击跳转到 `item.url`（devlog 全文）。
- 降级：列表为空（抓取失败或暂无更新）时，显示友好占位 + 「前往 devlog →」外链兜底（`DEVLOG_BASE_URL`）。
- 复用公开页排版 token（`public-layout.module.css` 等），与 about/faq 风格一致，配套 `updates.module.css`。
- 该页落在公开 chrome 下（非 `/dashboard`、非 `/admin`），自动套用 `PublicChrome` 的页头页脚。

### 5.3 首页「最近更新」区块 `src/app/page.tsx`

- 在现有 `statsStrip`（统计条）之后、`statementSection`（理念段）之前，新增一个 `<section>`「最近更新」。
- 服务端取 `getDevlogUpdates()` 的**前 3 条**，渲染为卡片：日期 + 标题 + 一句话摘要（+ 有封面则显示封面）。区块右上角「查看全部 →」链接到 `/updates`。
- 最新一条可标 `NEW`（基于 publishedAt 是最新；这里是静态视觉强调，不依赖 localStorage）。
- 降级：`getDevlogUpdates()` 返回 `[]` 时，**整段不渲染**（首页绝不因 devlog 故障而报错或留空块）。
- 抽成独立组件 `RecentUpdates`（`src/app/_components/` 下，server component，接收 `updates` 数组），保持 `page.tsx` 聚焦。

### 5.4 导航入口 + NEW 标记 `src/app/site-nav.tsx`

- 在 `PUBLIC_NAV_ITEMS` 加 `{ href: "/updates", label: "更新" }`（位置：放在「支持的学校」之后或「关于」之前，由实现时定，视觉权重适中）。
- NEW 标记：新增轻量客户端组件 `UpdatesNewBadge`，渲染在「更新」项旁：
  - 挂载后 `fetch("/api/devlog/latest")` 拿 `{ latestPublishedAt }`（**同源**内部端点，无 CORS）。
  - 读 `localStorage["lilink.devlog.lastSeen"]`；若 `latestPublishedAt > lastSeen`（或无 lastSeen 记录且存在更新），显示小红点 / `NEW`。
  - 用户访问 `/updates` 时，把 `lastSeen` 写为当前 `latestPublishedAt`，红点消失。
  - 任何失败静默不显示红点（badge 永不报错、永不阻塞导航）。

### 5.5 NEW 标记内部端点 `src/app/api/devlog/latest/route.ts`（server）

- Route Handler，调用 `getLatestDevlogPublishedAt()`，返回 `{ latestPublishedAt: string | null }`。
- 复用 §5.1 的缓存（同样 `revalidate: 3600`）。
- 存在的理由：让 NEW 标记完全封装在导航侧、自包含，不必把数据通过 `RootLayout → PublicChrome → SiteNav` 的 props 链下传，也不在 `dashboard`/`admin` 触发取数。

### 5.6 页脚链接 `src/app/public-chrome.tsx`

- 在 footer 链接组（关于 / 支持的学校 / 协议 / 隐私 / FAQ）中加 `<Link href="/updates">更新</Link>`。

## 6. 数据契约：`/updates.json`

```jsonc
{
  "generatedAt": "2026-06-01T00:00:00.000Z",  // 构建时间（ISO）
  "items": [
    {
      "title": "string",                       // 帖子标题
      "summary": "string",                     // 一句话摘要（schema 限 <=120 字）
      "publishedAt": "2026-05-27",             // 发布日期（ISO date），驱动排序与 NEW 判定
      "updatedAt": "2026-05-28",               // 可选；无则省略或 null
      "url": "https://devlog.lilink.top/posts/devlog-launch", // 全文绝对 URL
      "tags": ["产品", "上线"],                 // 标签显示名（resolveTags 后的 name）
      "cover": "https://devlog.lilink.top/_astro/xxx.webp",   // 可选封面绝对 URL；无则 null
      "featured": false                        // 是否里程碑
    }
  ]
}
```

主应用侧 TypeScript 类型（`DevlogUpdate`）与之一一对应，`updatedAt` / `cover` 为可空。

## 7. 容错、缓存与性能

- **容错优先**：任何 devlog 不可用的情形（端点未部署、网络故障、超时、坏 JSON）下，主应用所有入口都优雅降级——首页区块隐藏、列表页显示兜底外链、NEW 标记不显示——主应用功能完全不受影响。
- **缓存**：服务端 fetch `revalidate: 3600`（1 小时）。首页自身 `revalidate = 60` 不变；首页区块的数据走 devlog-feed 的 1 小时缓存，二者独立。
- **性能**：JSON 体积极小（当前 7 条）；服务端取数 + ISR，对页面 TTFB 影响可忽略。NEW 标记是挂载后的一次同源轻量请求，不阻塞首屏。

## 8. 配置

- 主应用新增可选服务端环境变量 `DEVLOG_BASE_URL`，默认 `https://devlog.lilink.top`。
  - 不写也能在生产正常工作（用默认值）。
  - 需在 `apps/api`/`apps/web` 的 env 示例与部署（Vercel）说明里登记（仅 web 用到）。

## 9. 验证策略

- **devlog**：`npm run build` + `npm run check`；构建后确认 `dist/updates.json` 存在且字段正确（url/cover 为绝对 URL、只含 published、按日期倒序）。
- **主应用**：`npm run typecheck`、`npm run lint`；本地起 web，验证：
  - `/updates` 列表页正常渲染、条目可跳转到 devlog；
  - 首页「最近更新」区块显示前 3 条、「查看全部」跳 `/updates`；
  - 导航与页脚「更新」入口存在；NEW 标记：首次访问显示、访问 `/updates` 后消失；
  - **故障演练**：把 `DEVLOG_BASE_URL` 指到一个坏地址，确认首页区块消失、列表页兜底、首页其余部分与 NEW 标记均不报错。
- 注意：根据项目经验，`next build` 在 `.claude/worktrees` 嵌套工作树下可能因 Turbopack root 推断失败；如在主工作树外执行，用 typecheck + lint 验证 web。

## 10. 实施顺序（供 plan 展开）

1. devlog：新增 `updates.json.ts` 端点 + 构建验证（可独立先行、先部署）。
2. 主应用：`devlog-feed.ts` 数据层 + `/api/devlog/latest` 端点。
3. 主应用：`/updates` 列表页。
4. 主应用：首页 `RecentUpdates` 区块。
5. 主应用：导航入口 + `UpdatesNewBadge` + 页脚链接。
6. 全链路验证 + 故障演练。

## 11. 风险与开放问题

- **封面绝对 URL**：Astro `image()` 构建产物路径（`/_astro/...`）的绝对化需在端点内用 `context.site` 处理；若实现成本偏高，封面可作为「加分项」延后，首页/列表先用纯文字卡片（不阻塞主体）。
- **部署次序**：建议 devlog 的 `/updates.json` 先上线，再上主应用消费侧；即便次序反了，主应用的容错也会让它在端点缺失时优雅降级。
- **NEW 标记语义**：以「最新一条 publishedAt」对比本地 `lastSeen`。首次访问（无 lastSeen）默认显示 NEW，属预期（鼓励首次点击）。
- **两仓库协调**：本设计跨 `LiLink` 与 `lilink-devlog` 两个仓库、两次部署；二者均为团队自有，协调成本低。
```
