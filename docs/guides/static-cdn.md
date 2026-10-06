---
kind: howto
lang: zh
---

# Vercel 静态资源生成与缓存

> 文档归属：[操作指南](README.md)。

前端和图片、JS、CSS、字体、图标全部继续由 Vercel 托管。独立静态 CDN 候选已撤回，不使用 Cloudflare Pages，也不额外拆分静态资源服务。此页保留原文档路径以说明退出状态，不提供候选方案的部署、上传或切换命令。当前缓存契约见[公开页面缓存](../reference/public-data-cache.md)，用量风险见[Hobby 预算](../plans/2026-10-03-vercel-hobby-budget.md)。

## 当前资源路径

- JS、CSS 和 Next 管理的字体使用同源 `/_next/static/`，不配置外部 assetPrefix。
- 固定插画与团队头像使用同源 `public/images/responsive/`。`StaticImage` 通过原生 `srcset`/`sizes` 选择构建时生成的 WebP，保留首屏预加载、图片就绪门控、布局尺寸与下方图片懒加载，不经过 `/_next/image`。
- 学校 logo 使用同源 `public/images/school-atlases/` 的分组图集和 1x/2x/3x 变体。每个学校保留原有文字与图片可访问名称，CSS 裁切只显示对应 logo。浏览到一组中的首个 logo 时会加载整组图片；减少请求不等于部分浏览时减少字节，需同时验收首屏与完整浏览。
- CSS 背景图、二维码预览与可下载原图直接使用同源带 hash 地址。二维码原图保留无损像素；不经 PostCSS 外部地址改写或资源 URL wrapper。
- 品牌、联系 SVG、安装图标和公共字体通过 `shell-assets.generated.ts` 使用同源带 hash 地址，保留原未版本化资源。页面 HTML 与接口缓存不使用静态资源的长期缓存策略。
- PWA 注册同源 `/sw.js`；离线文档和两枚带 hash SVG 图标从同源预缓存，下载有界，安装失败保留旧 worker，升级只删除自身旧缓存。
- 不保留静态 CDN 环境变量、图片版本目录、额外静态服务器或 Cloudflare 发布脚本作为当前工作流。

## 生成与旧地址

在仓库根目录使用已安装的锁定依赖运行生成器；图片处理复用现有 sharp，不下载外部原图。固定插画生成器只读取显式列出的已发布 WebP，检查源内容 hash、尺寸与单帧格式，生成不超过源分辨率的多个尺寸和 `static-image-manifest.ts`。学校生成器从学校伙伴清单读取 logo，输出图集、裁切坐标 CSS 和类型化 manifest。外壳资源生成器复制原始字节到 hash 文件，并更新类型化地址、相关 CSS 与 PWA 预缓存引用。

```sh
node scripts/images/generate-responsive.mjs
node scripts/images/school-atlases.mjs --report artifacts/images/school-atlases.json
node scripts/images/version-shell-assets.mjs
```

修改源图片后重新生成并检查 diff；重复运行应保持相同源与依赖下的输出字节和地址。已有 hash 文件的字节不得原地替换：内容变化使用新 URL，旧页面引用的地址继续可读。PWA 离线内容或图标更新时，同步提升 `/sw.js` 的缓存版本，以触发安装和自身旧缓存清理。

本机 `npm run build:web` 的 prebuild 会执行 `npm run images:generate` 对应的生成流程；Vercel 的显式 buildCommand 同样先运行该命令，再进入原有 `next build`。直接调用 `next build` 不触发 npm prebuild，不能依赖它自动生成新增图片或外壳地址。生产 API 环境配置继续遵循现有 Next 配置校验。

`legacy-public-paths.mjs` 保留明确列出的旧图片地址到压缩图的精确 308 跳转，以及曾发布的 immutable 图片；不使用图片路径通配跳转。没有迁移的旧图标和字体地址仍直接提供原资源。旧地址跳转会增加一次请求，新页面应引用生成后的最终 hash 地址。

## 浏览器缓存

Next 配置通过 `immutablePublicAssetHeaders()` 先遍历 `public/images`、`public/icons` 与 `public/fonts`，逐文件校验支持的图片/字体扩展名和 12 位 SHA-256 前缀；hash 不一致或符号链接会使配置失败。校验完成后，每个目录仅输出一条限定扩展名与 hash 的 immutable 规则，另保留普通图片的一小时缓存规则。保留资源与新资源共用规则，旧 immutable 文件字节不变，不重复输出逐文件声明；页面、接口、普通图标/字体和不存在资源不能获得一年共享缓存。

`build-route-summary.json` 保存 Next 生产构建的 header、redirect 与 prerender 摘要。声明数和本地 manifest 不是 Vercel 编译后的全部路由，也不是 CDN CPU 指标；减少规则后仍需用相同项目、环境和观测窗口的 Vercel 用量验证 CPU。

长期浏览器缓存可以避免重复访问的网络请求；Vercel 边缘命中仍属于资源交付。固定图直接交付减少对应动态图片优化读取，但静态图片的请求和流量仍要核算。此流程不改变页面 ISR TTL、缓存 tag 或 API 按需失效频率；图片 URL 与响应式标记改变可能改变 HTML/RSC 字节，不能据此承诺 ISR Writes 完全不变。

## 验收

通过统一 disposable E2E runner 验证真实导航、同源 JS/CSS/字体加载、可见图片解码、图片预加载与就绪状态、全部学校 logo、旧地址、immutable 响应头和 PWA 安装/升级/源站故障。使用同一隔离 session 的改动前冻结源码与最终候选，按相同路由、桌面/移动端视口、冷/暖浏览器和完整滚动方式比较资源请求；PWA 安装与已安装重访单独采集，不能将每个 PV 当一次安装。

`vercel-assets.spec.ts` 对全部已发布 hash 资源发起真实请求，校验响应字节、SHA 与缓存头，同时覆盖普通资源、伪 hash/缺失资源、旧 URL、页面和私有 API。`node --test scripts/images/immutable-assets.test.mjs` 在临时目录验证错误摘要和符号链接阻止配置加载，不能把构建守卫测试解释为已启动服务的 HTTP 成功。

浏览器项目与工件要求见[浏览器自动化测试](browser-e2e.md)。本地网络请求和优化图片响应的 8 KiB 读取包络不是 Vercel 账单；实际图片共享缓存命中、遥测、安装次数、私有业务和团队其他项目必须单独核实。中国大陆访问性能还需对照当前生产版本独立采样；本地同源验收不能代表大陆网络性能。

生成与图片行为边界见[固定图片契约](../../scripts/images/static-image-contract.md)；冷暖归属、PWA 会话成本和可重生成的对照命令见[资源对照契约](../../scripts/usage/browser-comparison-contract.md)。

历史 validation 中的 CDN 请求、跨域图片、独立静态服务器及候选预算仍属于当时的观察。保留这些原始证据，不将它们解释为当前部署拓扑或当前方案已通过的结论。生产 ISR 用量与其他 Vercel 用量仍须核算；发现风险时报告，不自动迁移 CDN。
