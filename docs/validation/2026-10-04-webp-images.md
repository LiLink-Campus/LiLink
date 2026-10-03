---
kind: changelog
lang: zh
---

# 全站位图 WebP 压缩与用量复测

> 文档归属：[验收记录](README.md)。月度容量模型统一维护在 [Hobby 用量方案](../plans/2026-10-03-vercel-hobby-budget.md)；真实大陆直连的波动归因见 [性能补测](2026-10-03-mainland-direct-performance.md)。

## 范围与选择

2026-10-04，按用户要求处理网站本地产品位图，并保留 SVG。未处理历史截图、文档插图、测试工件、第三方依赖或数据库中的外部商家图片 URL。Sentry 配置未变；未提交、推送或部署。

`public/images` 原有 36 份位图全部转换或重新压缩为 WebP。PNG 和已发布的无损 WebP 雪碧图解码像素相同，新的页面引用合并为一份；另增加两份二维码预览，合计 37 份当前交付文件。所有新位图名称包含内容 SHA-256 前 12 位，同时更新页面、CSS、学校目录、预加载和精确缓存规则的引用。

为保护已打开的旧页面和保存的图片链接，35 个旧普通路径在 Next 上以 308 跳转到新 WebP；独立 CDN 包输出相同映射的 Pages `_redirects`。已声明一年 immutable 的旧 `watercolor-atlas.09032dbdfd5e.webp` 额外保留原字节，不改写这个内容哈希地址；旧文件不再生成无用的响应尺寸变体。独立 CDN 发布继续遵循[保留旧构建资源](../guides/static-cdn.md)的流程。新版普通 Next 原图仍遵循通用一小时缓存规则，仅新旧 atlas 的精确规则是一年；带哈希文件名不等于所有环境自动获得一年缓存。

这里的最大化压缩指在可读性、透明度、扫码和安装兼容约束下提高编码压缩强度，不把质量参数设为最低，也不承诺有损图片逐像素不变：

- 插画和水彩背景：WebP quality 60、effort 6、smartSubsample，保留原尺寸。雪碧图保持 2172×724、3:1 比例及三格顺序。
- 学校位图：限定在 576×256 内等比缩小，quality 75；保留透明通道，检查解码后的 alpha 与缩放参考逐像素一致。
- 头像：限定在 336×336 内等比缩小，quality 65，对应约 112 CSS px 的三倍分辨率。
- 二维码原图：原尺寸、无损 WebP，RGBA 完全一致。页面使用最大宽 320 px 的 quality 75 预览（小红书原图仅 214 px，不放大），通过 `unoptimized` 直接请求已生成的 WebP，避免再次有损编码；原图链接仍打开无损版本。两份预览均独立验证解码内容。
- 14 个 SVG 保留；6 个 PNG 安装图标和 ICO 为格式兼容例外，使用最大 PNG 压缩等级做无损优化。未改扩展名、声明尺寸、MIME 或 SVG 内容。没有把图片格式兼容与是否支持普通 WebP 解码混为一谈。
- 独立 CDN 图片派生器同样使用 effort 6，编码参数纳入版本哈希，避免复用旧编码产物。Vercel 默认 Next Image 路径仍由其优化器处理，未在此轮更换托管架构。

## 文件体积

以下是源资产清单体积，不是一次页面下载量，也不是 Vercel 账单。MB 使用十进制。

| 类别 | 压缩前 B | 压缩后 B |
| --- | ---: | ---: |
| 插画 | 5,487,015 | 818,568 |
| About 雪碧图，原含两份相同内容 | 2,268,332 | 25,082 |
| 三个团队头像 | 1,398,268 | 28,306 |
| 学校位图 | 2,201,312 | 398,952 |
| 二维码，压缩后含原图和预览 | 677,591 | 503,068 |
| 页面位图合计 | 12,032,518 | 1,773,976 |
| PNG 安装图标和 ICO | 70,047 | 56,326 |
| SVG，未修改 | 378,106 | 378,106 |
| 当前图片合计，不含旧 URL 额外留存 | 12,480,671 | 2,208,408 |

页面当前位图减少 **85.26%**，包含兼容图标和 SVG 后当前图片总量减少 **82.31%**。另留存旧 immutable 背景 941,534 B，实际公共目录图片总量为 3,149,942 B；它只用于旧客户端，不在新版页面正常请求中加载。实际使用的旧 About 背景为 941,534 B，新背景 25,082 B，减少 **97.34%**；不能把其未使用 PNG 副本也算作每次访问的节省。

原图快照、完整前后 SHA、像素/alpha 断言及每个文件的参数在本机工件 `artifacts/images/2026-10-04/`。其中 `final/compression-report.json` 为主清单，`original/` 为本次修改前副本，`comparison.png` 为代表性左右对照。

## 验证前提与复现

环境为 macOS、Node 24.20.0、锁文件内 Sharp 0.35.4/libwebp 1.6.0。原位图均来自 Git 提交 `97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89`；压缩时先保存原始字节，不把已压缩的发布文件当作母版反复编码。

复现资产转换到新的空目录，不会覆盖产品目录：

```sh
asset_originals=$(mktemp -d)
asset_outputs=$(mktemp -d)
git archive 97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89 apps/web/public/images | tar -x -C "$asset_originals"
node scripts/images/compress-assets.mjs --source "$asset_originals/apps/web/public" --output "$asset_outputs"
npm run pwa:icons --workspace web
```

压缩器拒绝动画、符号链接、非空输出目录和源目录内输出；校验二维码原图像素和所有输出 alpha。当前图标生成器可重现 PNG/ICO，无需安装额外工具。源码压缩器与 CDN 派生器的职责分开：前者读取原母版交付源资产，后者为实际响应尺寸生成变体。

实际浏览器验收只连接 runner 创建的 loopback PostgreSQL/Mailpit/API/Web，使用合成账号。压缩前 `artifacts/usage/no-static-cdn-125495d0c7dd/` 保持原样，压缩后为独立 run `afea322a4ec2`，生产构建的静态 CDN 配置关闭。复现命令：

```sh
node scripts/e2e/run.mjs --no-static-cdn --serve --serve-minutes=30
node scripts/usage/capture-browser.mjs artifacts/e2e/<run>/session.json artifacts/usage/image-compressed-<run> --public-matrix
node artifacts/usage/image-compression-acceptance/run.mjs artifacts/e2e/<run>/session.json
node artifacts/images/2026-10-04/verify-icons.mjs
node artifacts/images/2026-10-04/verify-qr.mjs final
npm run typecheck:web
npm run lint:css -- apps/web/src/app/about/about.module.css apps/web/src/app/auth-page.module.css
node scripts/cdn/prepare-images.mjs
node scripts/cdn/verify-bundle.mjs
npm run docs:check
npm run docs:verify
```

`artifacts/` 中的验收辅助脚本与截图是本机留存工件，不作为随 Git 交付的长期入口。可重跑的项目 runner、用量采集器、压缩器、图标生成器和现有首屏预加载 E2E 位于仓库；辅助视觉验收的场景与断言在下节列明。

## 验收结果与边界

已完成源文件断言：6 PNG 及 ICO 三帧尺寸/位深/RGBA 不变、图标 SVG 哈希不变；二维码原 PNG、无损 WebP、压缩预览共 6 份文件均由 macOS Vision 识别成功，分别与同一码的原始内容 SHA 一致。扫码内容本身不写入工件。PNG 自适应过滤候选实测会变大，未采用；最终 7 个兼容文件均比原文件小。

页面验收覆盖首页、About、学校、注册两页、1 对 1 活动、三个团队页，以及合成账号登录后的活动轮播两图和匹配信件图。检查可见标题、图片真实解码与自然尺寸、透明校徽、三格背景定位、二维码原图入口、横向溢出、脚本/图片请求错误；保留 Chromium/WebKit 桌面与移动截图。IAB 用于人工视觉检查，不代替上述自动用户路径。

最终结果：

| 验证 | 实际结果与本机工件 |
| --- | --- |
| 图片用户路径 | `afea322a4ec2`，40/40，0 skip/flaky；52 页面状态、296 个 HTML 图片解码、24 个 CSS 背景解码，业务资源异常 0。`artifacts/usage/image-compressed-afea322a4ec2/validation.json` |
| 既有首页预加载 E2E | Chromium 148.0.7778.96 / WebKit 26.4，桌面和移动四项目，4/4，未重复下载主图 |
| 实际页面二维码 | 四项目共 8/8 裁图由 Vision 解码，原始内容 SHA 一致；`artifacts/images/2026-10-04/rendered-qr-verification.json` |
| 原图与兼容图标 | 两二维码原图 RGBA 完全一致；6 PNG 和 ICO 三帧像素不变；14 个 SVG 字节不变 |
| 旧 URL 的新生产构建 | `99e44e055d9d`，14/14 兼容测试及 4/4 既有预加载测试。35 URL × 两引擎共 70 次验证单跳、查询参数、WebP 解码；旧 atlas 原 SHA、一年缓存不变；另 4/4 旧二维码直链裁图解码。`artifacts/usage/image-url-compat-99e44e055d9d/validation.json` |
| CDN 升级包 | CLI 16/16，本机模拟器 HTTP 35/35；52 条 headers、35 条 redirects，1,158 个旧 immutable 资产 SHA 保持。工件 `artifacts/usage/cdn-upgrade-redirect-validation/report.json`。它复用旧 chunks/变体验证升级合同，不是新的实际 CDN 部署 |
| 图片派生 | 本轮参数版本 `b8277e29209ccd9d0cd36045`，37 源、1,110 WebP 变体成功生成 |
| 人工视觉 | IAB 1440×1000 / 390×844；首页两张大图、About 三格背景/头像/二维码、校徽、活动插画、团队页、登录注册背景、仪表盘轮播两图和匹配信件。截图与读图记录位于 `artifacts/images/2026-10-04/iab/` |
| 静态检查 | `typecheck:web`、两份修改 CSS 的语法检查、`git diff --check` 通过；文档门禁最后重跑结果见本机 `artifacts/docs-verification/` |

首轮图片辅助验收的 32/40 和完整日志保留：四项因为浏览器把 CSS 左对齐序列化为等价的 `0px 50%`，四项为已成功显示页面后的 Next RSC 取消。修正验收器对等价位置和明确 `ERR_ABORTED` RSC 的分类后复测 40/40，没有改产品或忽略图片/脚本失败。两轮 fixture 都已安全回收，合成数据和临时服务均未进入开发或生产环境。

完整用量矩阵为五个公开路由 × 两个视口 × 冷/暖访问共 20 组，保存于 `artifacts/usage/image-compressed-afea322a4ec2/`。最大冷响应量由 1,650,678 B 降到 837,206 B，减少 49.28%；最大冷请求数仍为 50，首页仍为 30。按同口径 50,000 PV 全冷包络、1.2 不确定性系数和其他项目预留测算：

| 月度指标 | 压缩前无独立 CDN | 压缩后无独立 CDN | 保留 20% 的预算线 |
| --- | ---: | ---: | ---: |
| CDN 请求 | 3,595,520 | 3,595,520 | 800,000 |
| Fast Data Transfer | 107.010 GB | 59.010 GB | 80 GB |
| 图片缓存读取单位 | 4,080,000 | 3,540,000 | 240,000 |

压缩明显改善流量，仍不足以取消静态外移并保证 Hobby 所有指标留余量。ISR、函数和源站传输的假设、原始体积压力层、冷访问占比敏感性及所有资源明细由[统一预算模型](../plans/2026-10-03-vercel-hobby-budget.md)维护。原始账本含未收完的暖流响应，暖访问推算不是保证；旧客户端首次跳转多出的请求也不在这份 fresh 访问账本内。

本机功能和传输字节验收不等同于真实大陆线路性能证明，也不等同于物理 iOS 或微信/小红书 App 的扫码验收。新图片尚未部署，线上 72 次直连观测仍对应旧图。
