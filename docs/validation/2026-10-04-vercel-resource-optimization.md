---
kind: changelog
lang: zh
---

# Vercel 静态资源、学校图集与背景融合验收

> 文档归属：[验收记录](README.md)。当前容量假设维护在 [Hobby 用量方案](../plans/2026-10-03-vercel-hobby-budget.md)，资源生成和缓存契约维护在 [静态资源指南](../guides/static-cdn.md)。

## 范围与比较基线

2026-10-04，保留 Vercel 现有前端和所有图片、JS、CSS、字体托管，优化浏览器缓存、固定图片交付和学校图集。沿用 API → Vercel 的失效通知与约 30 分钟统计合并策略；本轮资源修改没有增加定时失效、SSE 或浏览器统计轮询。没有提交、推送或部署。

修改前已冻结当时的未提交资源源代码，摘要为 `51095c151a5fe17e2b95fb8d0f5e0f0a9a0cc9358a9ca88b02b0e815f6375b53`，清单及原字节在本机 `artifacts/resource-optimization-20261004/before-source.json` 和 `before-source/`。这个基线已经包含此前 ISR 与 WebP 改进；它不是 Git HEAD，也不是当前线上部署。前后生产模式 Web 使用同一个一次性 API、PostgreSQL 和 Mailpit，以及合成业务数据。

## 最终行为

- 只有内容 SHA 校验通过的哈希资源获得一年 `immutable` 浏览器缓存；普通 URL、页面和 API 不套用此规则。字体、品牌 SVG、联系图标、PWA 图标与离线页引用相同的版本化地址。
- 9 个固定图片源在构建时产生 45 个响应尺寸变体，通过同源 `srcset` 交付，保留最高有效分辨率、尺寸、裁切、alt、lazy/eager 与图片解码门禁。首页早期预载和显示图片采用同一选择；删除组件中的重复手写 preload。
- 28 个学校 logo 按合作行分为 2/3/10/13 个的四组图集，保留 1x/2x/3x。前两合作行分别使用独立图集，3x 为 41,434 和 50,696 B；完整四组 3x 合计 495,412 B。最初两组方案让首屏等待 216,640 B 图集，两轮慢网对照发现移动 LCP 增加约 150 ms；中间四组方案第二行还携带后续行的 logo，首轮又出现 124 ms 增量，因此进一步按实际首屏合作行切分，没有降低 DPR 或编码质量。
- 所有 logo 在裁切外层进行一次背景合成，白色底片随网页 canvas 颜色融合。学校页明确提供 canvas 背景，让普通进场动画形成的合成层也有正确底色；删除旧外国 logo 内层的重复混合。源图、校徽细节、文件 URL 和图集尺寸不因背景修复而改变。
- 35 个旧图片 URL 的同源 308 兼容目标仍存在；曾发布的旧 immutable atlas 保留原字节。离线页、worker 预缓存与 manifest 图标版本一致。

## 请求与图片优化读取

完整页面滚动采样覆盖桌面/移动、冷/暖访问及首页、关于、学校、注册入口、学校注册，共 20 个匹配条件。浏览器内存/磁盘命中不计出网请求；304、重定向分别保留，未完成响应显式列出。资源使用同源 Vercel 地址，优化后公开路径没有 `/_next/image` 请求。

最终采样 run 为 `f3c47b950f08`，Chromium `148.0.7778.96`，Web/shared/资源生成入口快照摘要 `91a044cf209bdb844e2a879bb758af75b4b530085f391d14d199edd96021e075`。本机源快照在 `after-row-split-source.json` 与 `after-row-split-source/`，完整 20 条件采样在 `artifacts/resource-optimization-20261004/row-split-usage/`，对比在 `row-split-comparison/summary.json` 与 `.md`。此前两组、四组与背景修复中间实验另存，未覆盖失败或旧样本。

| 页面 | 冷访问请求，前 → 后 | 暖访问请求，前 → 后 |
| --- | ---: | ---: |
| 首页 | 30 → 29 | 6 → 5 |
| 关于 | 30 → 29 | 7 → 3 |
| 学校 | 50 → 25 | 4 → 3 |
| 注册入口 | 21 → 20 | 3 → 2 |
| 学校注册 | 23 → 22 | 3 → 2 |

桌面与移动的请求计数一致。公开页面冷访问包络由 50 降至 29（42%），暖访问包络由 7 降至 5（28.6%）。优化器响应按独立对象 8 KiB 向上取整的冷访问包络由 59 降至 0；暖访问原本为 0。此包络用于容量建模：实际 Vercel Image Cache Reads 取决于平台共享缓存读取，浏览器请求及其响应体积不能代替账单；也不证明整个项目的私有或动态图片用量为零。

沿用 50,000 PV、相同不确定系数、PWA 压力预留、Sentry、回调及其他预留，50% 冷访问时月请求模型为 2,180,520 → 1,490,520，全部冷访问时为 3,590,520 → 2,330,520。请求仍超出 Hobby 额度的 80% 目标；不能通过下调未知访问比例制造达标。PWA worker 在普通生产访问后也会自动注册，其首次安装/升级成本应按浏览器 worker 会话计算，实际月次数未知，独立校准模型继续标记 UNKNOWN。

规划传输包络为冷 862,080 → 854,316 B、暖 10,693 → 9,510 B。六个暖访问的 devlog 响应尾段未完成，计数保留，体积只含已观察的部分。移动首页 gzip 响应体由 678,828 增至 733,561 B，移动学校页由 817,248 增至 833,024 B；固定图片绕开原优化器后不能宣称每个页面下载量都下降。局部 Vercel 遥测端点在本机返回 404，单独记录，线上遥测实际次数未降低为零。

## ISR 的影响边界

本轮没有修改服务端缓存键、tag、失效频率或再生成间隔。首页完整 HTML、RSC、分段 RSC、tree 与 meta 独立按 8 KiB 取整，本机两版合计均为 22 单位；原字节、路径、SHA 与独立取整记录在 `row-split-cache-outputs/summary.json`，两侧各 100 个本机文件的完整快照可复核。相同失效条件下，首页模型单次再生成 74,911.2 和保守双次再生成 114,220.8 单位/月均不变。

全体预生成路由文件的保守包络为 217 → 221 单位：学校 RSC 和两个分段各由 4 增至 6，404 的两份 RSC 各减少 1，净增加 4。学校页不依赖首页统计失效 tag，这个差异不能乘以全部首页统计刷新次数；部署时生成对象可能改变写入用量。本机文件不是 Vercel 账单对象，因此既不能断言全项目 ISR Writes 完全不变，也不能把这 4 单位直接当成平台计费事实。

历史控制台 LiLink 最近 30 天请求 134K、图片读取 2.6K，与 50,000 PV 的完整滚动冷访问压力场景范围不同；Analytics 事件不能充当完整 PV。用户另提供的 ISR 179K、9.21–10.3 为另一时间窗口，不与历史 166K 混成同一个账期。尚未部署本次优化，累计生产计数不能作为本次效果。最终仍需相同项目、账期、PV、部署次数和缓存条件下的生产增量验收。

## 行为验收与工件

Logo 回归 E2E 在 CSS 修复前编写，覆盖 28 个唯一校名、完整可见的裁切框、实际图片解码、背景周边像素、白底片像素和可见笔画，以及 Alberta 源图白边。比较真实渲染结果，没有锁定 `mix-blend-mode` 属性。普通动画和减少动画两种用户设置分别覆盖 Chromium/WebKit 桌面与移动；截图与 JSON 像素证据按 logo 保留。

早期像素实验 `e9bb3a54f7b8` 和 `de43474c2e86` 保留原始失败或通过结果，但独立复核发现早期部分裁切截图内容与目标 logo 不符，不能作为最终验收证明。旧实验先滚动整张 oversized atlas，后续将滚动对象限定为裁切框；具体截图错位机制没有独立确认。本机 Playwright 在 `fullPage=false` 时 clip 是 viewportRect，不能归因为已经证实的页面坐标/视口坐标差异。最终测试改为完整 viewport PNG，再用实际裁切框的 viewport 坐标取样，检查背景点和完整 logo 都处于视口，保留真实动画完成后的合成层；像素或细节断言没有放宽。正常动画下的旧版白底另保存内置浏览器截图 `iab/logo-background-before-mobile.png`。

现有缓存 E2E 首轮 run `7ab74c3de425` 为 87 通过、3 失败、2 跳过。失败保留原工件：一个启动时的合法通知重试污染了 36 秒稳定观察窗，两个定位匹配到流式 Suspense 的隐藏重复节点。后续仅修测试前置条件与可见定位：用 CAS 推进隔离 pending 通知的时钟，保留 revision、ack 与有效 lease，等待真实 dispatcher、上游生成时间和实际同源 Data Cache 收敛；36 秒全程 HIT 与完整 HTML SHA 断言继续保留。匹配、资料修改与账户真实路径的首轮通过证据继续有效。

最终资源、PWA、预载与 logo run `c87c5a56b79f`：30 通过、2 跳过、0 unexpected/flaky。Logo 的桌面/移动 Chromium 148 与 WebKit 26.4、正常/减少动画共 8 份 JSON，每份 28 个唯一名称，224 个样本白底片计数全部为 0，最小前景占比 20.68%，Alberta 源白边与实际周边背景最大色差 1。独立查看桌面 Chromium 与移动 WebKit 的 CUC/CUGB/Alberta/UBC 共 8 张全视口 PNG，图案与学校标题对应，复解码的周边背景样本与 JSON 一致。两个跳过为已记录的 Playwright WebKit 真离线 SW 导航模拟缺陷；两引擎的源站不可达、预缓存失败和更新保留旧缓存路径仍通过。

认证、首页缓存稳定和 ISR run `908834fc3e1d`：4 个桌面/移动引擎共 44 通过。内置浏览器最终 run `f3c47b950f08` 在 1280×800、390×844 和 640/641×900 检查学校页，28 张 logo 解码、正常动画背景融合及无横向溢出成立；PNG 与元数据在 `iab/logo-row-split-*`。其他静态图片消费页、轮播与信件展开/收起的前序验收证据另存同目录和 Storybook 工件。

性能采集器先补真实浏览器失败边界，再修 overflow 祖先裁切交集，避免折下 oversized atlas 被错误算作首屏图片；Chromium 9 场景从 7 失败/2 通过变为 9/9 通过。可见未解码图片、已启动 decode 和 `data-page-image` 门禁仍严格阻塞。原始证据在 `artifacts/performance/collector-clip-before-f3c47b950f08-native/` 与 `collector-clip-after-f3c47b950f08/`，不修改应用图片加载行为。

构建生成链已复核：本机 prebuild 与 Vercel 显式 buildCommand 都先生成资源，生产入口保留直接 Next 环境校验。45 个响应图片、12 个图集、12 个 shell 资源的 manifest 引用、实际文件和内容 SHA 一致，相关代码与最终冻结源一致。Web、Storybook 与 E2E 类型检查、受影响 CSS/ESLint 和生成器语法检查通过；远端 CI 未触发。文档检查与验证通过：146 篇索引、0 stable diagnostics、1 个已有 preview 诊断（历史 `2026-10-03-public-performance.md:108` 的 EVD001，原 64 样本试跑已注明不构成最终统计验收，本轮 320/80 的新证据另存）。最终模型 CLI 22/22、ISR 契约 27/27、比较边界 3/3 通过，全用量检查按预期返回未达标，工件在 `row-split-budget/`。

最终主性能对比 `performance-row-split/summary.json` 与 `.md`：十轮交替顺序配对、320/320 样本、72/72 指标 PASS，0 功能失败，CLS 均为 0。采集器 12 个脚本的冻结源及 SHA 在 `performance-collector-source.json`，摘要 `80efc308a07bcc34a2f7d39b43e272f0a138a710f289421b9d2304b259b549f9`，文件修改时间均早于本次采样开始。

| 冷访问 LCP 中位数 | 桌面，前 → 后 | 移动，前 → 后 |
| --- | ---: | ---: |
| 首页 | 916 → 932 ms | 908 → 940 ms |
| 关于 | 880 → 868 ms | 880 → 872 ms |
| 学校 | 836 → 810 ms | 892 → 948 ms |

时间指标的判定使用预先声明的 `max(100 ms, 基线中位数的 10%)` 容差，交互反馈为 `max(20 ms, 10%)`；中位数与 p75 的配对 bootstrap 95% 差值区间上界和 p75 差值均满足门禁。移动学校页存在 +56 ms 的中位数增量（p75 +53 ms，p75 差值区间 47…56 ms），不能表述为所有页面都加快或严格零差异；它比两组和中间四组实验的 +150/+124 ms 明显收窄。实验室使用 150 ms、10 Mbps/2 Mbps、4× CPU 压力与正常动画，service worker blocked，native LCP 最少观察 1 秒且等待图片解码与 LCP 静默 1 秒；SPA 的点击使用真实可信点击到目标内容/字体/图片/控件就绪，不冒充原生 LCP 或 INP。尚不测量大陆到 Vercel 的路由、DNS/TLS 或真实边缘状态，生产对照验收仍待授权部署后进行。

立即点击独立对照 `early-click-row-split/summary.json` 与 `.md`：80/80 样本、4/4 路径指标 PASS、0 功能失败。每次使用新浏览器，严格等待首页字体、图片、解码和控件就绪，随后只做必要滚动和可信点击，没有人为 dwell；比较两种视口的首页→关于/注册。harness 源与 SHA 随工件保存。这项只确认自定义 click-to-content-ready，在测试环境的声明容差内，没有实时推送或关掉有用预取。

## 可重复运行

前提：Node 24.20.0、npm 锁定依赖、Docker 可用；runner 自动创建 loopback PostgreSQL/Mailpit/API，生成合成学校、账号和问卷，结束后回收，仅保留脱敏本机工件。不要指定已有开发或生产数据库。

```sh
npm run images:generate
node scripts/e2e/run.mjs school-logo-background.spec.ts vercel-assets.spec.ts home-artwork-preload.spec.ts pwa.spec.ts pwa-origin-failure.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit --grep @smoke
node scripts/e2e/run.mjs auth.spec.ts home-cache-stability.spec.ts isr-write-budget.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit --grep @smoke
node scripts/e2e/run.mjs --serve --serve-minutes=90 --extra-client-origin=http://127.0.0.1:61085
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61085 HEAD --snapshot=artifacts/resource-optimization-20261004/before-source.json
node scripts/usage/capture-browser.mjs artifacts/e2e/RUN/session.json artifacts/RESOURCE/after --public-matrix
node scripts/usage/capture-browser.mjs artifacts/e2e/RUN/session.json artifacts/RESOURCE/before --public-matrix --before artifacts/performance/baseline-RUN/comparison-session.json
node scripts/usage/compare-browser.mjs artifacts/RESOURCE/before/browser-usage.json artifacts/RESOURCE/after/browser-usage.json artifacts/RESOURCE/comparison
node scripts/usage/capture-route-outputs.mjs artifacts/e2e/RUN/session.json artifacts/performance/baseline-RUN/comparison-session.json artifacts/RESOURCE/cache-outputs
node scripts/performance/compare.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --before-label frozen-51095c151a5f --after-label candidate-source-digest --rounds 10 --profile mobile-pressure --routes home,about,schools --observation-ms 1000 --output artifacts/RESOURCE/performance
node scripts/performance/early-click.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --before-label frozen-51095c151a5f --after-label candidate-source-digest --rounds 10 --profile mobile-pressure --output artifacts/RESOURCE/early-click
node scripts/performance/summarize.mjs artifacts/RESOURCE/performance/raw.json
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc --noEmit -p e2e/tsconfig.json
npm run lint:css -- apps/web/src/app/schools/schools.module.css apps/web/src/app/schools/school-logo.module.css
npm run docs:check
npm run docs:verify
```

`RUN` 与 `RESOURCE` 需替换为本次真实隔离环境和新的输出目录。源快照已经存在时只能验证复用，不能用后来的 HEAD 重建旧 dirty 基线。性能采样期间不并发构建、E2E 或其他浏览器压力测试；原始配对数据、失败、浏览器版本、视口和截图全部保留。主性能 Markdown 可由原始 JSON 重生成；立即点击报告与 JSON、harness 源一同保留，并由上述隔离采样命令重复生成。本机通过不代替远端 CI 或生产计费。
