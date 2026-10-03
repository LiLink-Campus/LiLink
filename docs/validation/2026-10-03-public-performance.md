---
kind: changelog
lang: zh
---

# 2026-10-03 公开页面性能对照验收

> 文档归属：[验证记录](README.md)。当前状态：**修复版正式实验完成 480/480 个样本、120/120 个指标组通过预先固定的实验容差，功能失败 0。** 个别指标略慢，详见结果表；这不等于速度完全相同，也不代表真实 CDN、大陆直连或生产用户性能。采集器的两项故障识别已通过；额外 WebKit 首轮 8 项通过、2 项 CDN 缓存头断言失败，修复后对这 2 项定向复验均通过；立即点击补充组 80/80 样本、4/4 指标组通过既定容差，关于页点击仍有 21–31 ms 的中位数增量。

## 比较对象与已有证据

用户要求降低 Vercel 用量的同时验证性能不退化。资源请求数或传输量下降只能说明加载成本变化，不能证明首屏、点击后导航、交互响应或布局稳定性改善。

此前用量基线来自 run `0b5fc08bde7d`，工件为 `artifacts/usage/before/browser-usage.json`。该运行器结束时已清理 `workspace` 与 `session.json`，未保存原始未提交源码快照。不能把当前 Git HEAD 重新构建后冒称那次未提交版本。新的基线明确固定为提交 `97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89`（以下简称 Git HEAD 基线），改进版为本轮实际测试前冻结的工作树内容；两者需留存来源与逐文件 hash。

本轮隔离服务 run 为 `775724ea2239`：基线 Web `http://127.0.0.1:61081`，改进版 Web `http://127.0.0.1:59574`，共用 API `http://127.0.0.1:59573/v1`，静态 CDN `http://127.0.0.1:59575`。它们是有时限的本地测试地址，不是部署地址。基线元数据为 `artifacts/performance/baseline-775724ea2239/comparison-session.json`。改进版源码归档为 `artifacts/performance/after-source-775724ea2239.tar.gz`，SHA-256 为 `7bbba36faff10c18eea72ababe8164fc4700ef988ac4b459366233fc734c4115`；归档排除 `.env*`、依赖、构建产物与可再生成图片。

上述改进版归档对应**尚未修复预取的第一候选版本**。后续恢复一个入口预取后已重新归档并单独采样，不能将两个版本的结果合并成同一个 after。

修复版使用 run `8c52933a4a23`：基线 Web 仍为 `http://127.0.0.1:61081`，改进版 Web 为 `http://127.0.0.1:60848`，API 为 `http://127.0.0.1:60847/v1`，CDN 为 `http://127.0.0.1:60849`。新源码归档 `artifacts/performance/after-source-8c52933a4a23.tar.gz` 的 SHA-256 为 `440750a9b469d9dec45ac8375e2e5786a7820c22104e0a147d515cd33066780a`。`artifacts/performance/environment-8c52933a4a23.json` 再次记录了两条 API 投影相等断言，以及 Codex in-app browser 在 1280×800 和 390×844 下从首页实际点击至关于页、标题可见及图片已就绪的证据；它们证明该路径可用，不能替代正式计时。`artifacts/performance/current-source-match.json` 在正式结束、后续 CDN 缓存头修复之前比较归档与当时 Web/shared/CDN 源码，493 个实际文件全部一致，无缺失或额外非忽略文件；这是历史核对，不代表后续 4 个 CDN 脚本变化后仍全部一致。580 个 AppleDouble 元数据项单独忽略。`sentry-preservation.json` 确认 `next.config.ts` 中 Sentry wrapper 与 HEAD 相同，保持配置的约束成立，真实上传性能仍未验证。

旧采样使用 Chromium `148.0.7778.96`、无节流 loopback 网络、整页滚动、截图与 `networkidle` 等待。before/after/final 工件的多次热访问均为 `networkSettled=false`，`durationMs` 约 10.5 秒，反映最多 10 秒的等待超时；它不是 LCP、首屏时间或交互耗时。现有页面可用性及资源验收见[缓存与 CDN 验收](2026-10-03-vercel-cache-cdn.md)，不替代本文性能比较。

## 实现采集器前确定的失败方式

| 失败方式 | 必须观察的结果 |
| --- | --- |
| JS/CSS 请求移出主域后，额外连接或 CDN 延迟抵消下载收益 | 总加载路径的 LCP、首屏完整可见时间不能只按主域请求计算 |
| 禁用预取使点击后导航变慢 | 真实点击首页至关于页、注册入口，单独量 click-to-ready |
| 只显示标题或加载提示就提前停止计时 | 检查首屏实际可见内容、图片解码、透明度、遮罩及可操作控件 |
| 冷页面成功但热页面、缓存升级或 PWA 回访回退 | 浏览器冷/暖与首次安装/已安装分别报告 |
| 轮询、动画或字体导致晚到布局偏移、主线程阻塞 | 测量初始 CLS，并在固定交互与动态刷新窗口继续观察 |
| 一个版本 API/CORS/缓存未准备好 | 就绪或数据对齐失败使该样本失败，不当作性能改善或删除异常值 |
| 网络中断、图片失败反而产生较短 LCP | 同时要求资源、页面内容和真实交互断言成功 |
| 测试机负载、样本不足或测量抖动 | 输出原始样本及不确定性；不能把证据不足判为通过 |

## 公平的源码、数据与服务准备

由统一运行器启动一套临时 PostgreSQL、Mailpit、当前 API、改进版 Web 与独立静态 CDN；数据来源保持 `seed-defaults.mjs` 和 `e2e/support/seed.mjs` 的相同合成数据。另以 `git archive` 从固定提交建立只读来源副本，只构建并启动基线 Web，复用同一个 API。任何源码复制都排除本机 `.env*`、凭据、旧 `.next` 与生成产物，不启动第二套不同数据的后端来混淆差异。

静态检查已确认兼容性：Git HEAD 基线读取的 `/v1/public/landing`、`/v1/public/community`、`/v1/public/schools` 在当前 API 中仍保留；现有改动保留响应字段，只增加聚合路由与失效机制。当前 `packages/shared`、`package-lock.json` 相对 HEAD 没有差异。同一运行态 API 的实际投影断言也已通过：`home.landing` 等于 `landing`，`home.community` 等于 `community`（忽略生成时间 `generatedAt`）。证据为 `artifacts/performance/environment.json`；这还不是两端浏览器内容和性能断言。

API 的 CORS 使用 `CLIENT_ORIGIN` 精确白名单。启动隔离 API 前必须把基线和改进版的两个 loopback origin 明确加入逗号分隔配置。不能通过禁用浏览器安全机制、伪造 `Origin` 或吞掉 CORS 错误让基线看似成功。认证测试只使用匿名状态和合成账户。

依赖连接沿用统一运行器的 `linkDependencies` 规则：依赖版本相同，根 `@lilink`、`api`、`web` 链接指向各自隔离源码，防止基线导入当前产品代码。先在基线副本执行 `npm run build:shared`，再执行 `npm run build:web`。生产构建及运行均显式设置同一个 `NEXT_PUBLIC_API_BASE_URL`、`NODE_ENV=production`、`NEXT_TELEMETRY_DISABLED=1`；`LILINK_BUILD_WORKSPACE_ROOT` 只用于解析现有依赖。沿用隔离 E2E 的空 Sentry DSN，不继承本机上传 token；这不是修改产品 Sentry 配置，也不能验证真实 Sentry 上传的性能影响。基线不设置 `NEXT_PUBLIC_STATIC_CDN_URL`，改进版设置本轮实际静态资产 origin。

先检查 API 已完成 seed、Web 生产构建成功、CDN 对应当前构建 hash，停止所有构建后再采样。两个 Web 可同时待命，浏览器测量串行进行；不要一边构建另一版本一边计时。运行前记录 Node/npm/浏览器版本、硬件、操作系统、电源状态及节流配置，禁止访问用户个人浏览器配置。

本轮已记录环境：macOS arm64，硬件 `Mac17,8`，18 个逻辑 CPU、64 GiB 内存、接通电源且已充满；Node `24.20.0`、npm `11.19.0`。实际 Chromium 版本随性能工件记录。高性能 Mac 上的 4 倍 slowdown 不应解释为某个具体手机型号。

## 网络与缓存分组

| 组别 | 状态与用途 |
| --- | --- |
| 本地无节流 | Web/API/CDN 均 loopback，检测代码和渲染差异，不能代表线上网络 |
| 固定压力 | 桌面/移动视口分别使用 150 ms、10 Mbps 下载、2 Mbps 上传、4 倍 CPU slowdown；实际采用值写入工件 |
| 真实外部 CDN | 只有获得明确网络/资产发布授权后测试；记录实际域名类别、DNS/TLS、协议、缓存响应与所在地区，当前尚未验证 |
| 浏览器冷 | 每次创建新 context，清除该 context 的 HTTP 缓存与站点状态；不声称 OS DNS、TLS session 或服务器也冷 |
| 浏览器暖 | 同一个 context 先完整访问一次，再访问同路由；两版本预热步骤相同，记录缓存命中，不能只测改进版暖缓存 |
| PWA | 主性能组禁用 Service Worker；首次安装、已激活后回访单独采样，避免 SW 缓存掩盖网络差异 |

Web、Nest API、静态 CDN、Sentry/遥测都属于用户实际加载路径。网络报告按 origin 类别分列，并提供全部类别合计；Vercel 预算中的“外移请求”不能从性能报告删除。跨域 Resource Timing 缺少 `Timing-Allow-Origin` 时可能隐藏细节，须明确记录，不把 0 字节或 0 延迟当作没有成本；必要时使用隔离 Chromium CDP 网络证据。

本地双端口 HTTP 服务没有真实 DNS、TLS、HTTP/2/3、地区 RTT 与运营商路径，连接池行为也可能不同。固定节流只是给同一机器施加的实验条件，并不等于真实手机或某个移动网络。本轮运行保持服务启动且不主动清空服务器缓存，保留两版本原本的 30 秒与 3,600 秒 TTL。`artifacts/performance/server-cache-strategies.json` 从实际构建 manifest 核实这两个 TTL。没有逐响应保存 HIT/STALE/MISS 头，也没有逐次识别后台 ISR；长实验期间可能发生各自重新生成，测到的是各自策略的整体表现，不能声称每次都命中或已隔离每次重建的影响。单独诊断 ISR/进程冷启动是后续可补的设计，不是本轮已执行项。

### 已证实的直连验证阻断

本节记录关闭 TUN **之前**的历史状态。用户随后关闭 TUN，已复核 IPv4 路由为 `en0`、探测出口为 CN；新的真实网络观测见[大陆直连补测](2026-10-03-mainland-direct-performance.md)，不覆盖或改写下述旧证据，也不等于未部署 CDN 候选已完成验收。

`artifacts/performance/network.json` 记录了本轮只读网络探测：已清空代理环境变量并使用 curl 显式 no-proxy，但两个 Cloudflare 测试域名的解析目标仍经 `utun1024`，属于 TUN 路径；Cloudflare 对这些探测返回 `country=SG`、`colo=SIN`。固定公共目标的路由同样经过 TUN；绑定 `en0` 并固定两个官方目标地址的探测均在约 5 秒后超时。

因此，浏览器使用 `--no-proxy-server` 不能证明已经绕过 OS TUN，目前没有可信的“中国大陆直连”性能测试路径。这只说明当前探测出口与路由，**不证明用户物理位置，也不代表全部大陆运营商的可达性**；绑定接口的失败也不能直接归因于 LiLink 或其 CDN。管理 socket 未能连接，文件中的 TUN/DNS 配置不是成功的运行态 API 检查；此处结论主要依据实际路由与探测结果。没有修改系统代理、TUN、路由或应用设置。最终 `artifacts/performance/network-final.json` 于 19:37:12 UTC 再次清空代理环境并使用 no-proxy 探测，路由仍为 `utun1024`，Cloudflare 返回 SG/SIN；不是沿用早先状态而未复核。真实直连结论保持未验证。

## 页面、动作与指标

主路径覆盖 `/`、`/about`、`/schools`、`/register`、`/register/school`，桌面 1280×800 与固定移动设备描述符；两侧使用同一 locale、时区、字号、视口、缩放与设备像素比。主组保留正常动画，减少动画设置另列，不以关闭动画后的成绩代表默认用户体验。

在文档开始前注入 `PerformanceObserver`，保存 FCP、LCP 候选及元素类别、CLS 和长任务；使用 `performance.now()` 的同一单调时钟。首屏观察期间不先滚动或点击，否则浏览器可能停止产生 LCP 候选。当前采集器要求导航后至少 5 秒、业务就绪后至少 1 秒且 LCP 候选至少 1 秒未更新才收尾；这是观察窗口，不是把 5 秒当作 LCP。30 秒超时必须失败，不能把最后一个不完整候选作为成功值。[LCP 定义与观察限制](https://web.dev/articles/lcp)

| 指标 | 观察契约 |
| --- | --- |
| FCP / TTFB | 浏览器原生 Navigation/Paint Timing；用于定位，不能单独证明完整内容已可用 |
| LCP | 当前文档可见视口内最大的有效内容呈现时间，同时记录候选类型；页面不完整即不能判成功 |
| 首屏完整可见 | 首页实际在视口内的 hero、正文与 CTA 可见，无加载遮罩；关于页图片已解码、`data-image-ready=true`、`aria-busy=false`、正文 opacity=1；学校/注册页对应内容和控件可操作 |
| click-to-ready | 在首页真实点击“了解更多”或注册入口，从浏览器事件时点至目标内容完整可见；当前固定在源页就绪后将入口滚入视口并停留 2 秒，让基线预取有公平机会；立即点击另列补充组 |
| 交互可用性与反馈耗时 | 原生指标冻结后真实填写注册学校邮箱并等待合成学校匹配反馈，记录 `emailFeedbackMs`；移动端真实点击至菜单完整可见记录 `menuFeedbackMs`，随后关闭。两者使用浏览器事件起点及可见反馈终点，包含就绪检查开销，不是 Event Timing/INP |
| CLS | 使用最大布局偏移会话窗口并排除近期用户输入规则，不能简单相加全部 layout-shift；当前仅记录初始观察窗口，未覆盖 60 秒刷新后或整段访问生命周期 |
| 主线程与资源 | 记录长任务、加载阶段脚本时间、各 origin 请求/字节作为诊断；没有 Lighthouse 对应边界时不把自定义长任务总量命名为标准 TBT |

`locator.isVisible()` 本身不能证明元素位于首屏、opacity=1 或没有被遮挡，准备条件应结合几何范围、样式和真实输入反馈。用浏览器内观察标记减少 Playwright 断言轮询造成的额外耗时；若仍使用轮询，报告其测量分辨率。截图应在关键计时结束后生成，以免把截图成本计入指标。

`contentReady` 是 DOM、图片解码、样式和控件满足检查条件的语义时刻，不是屏幕合成帧的逐像素检测。个别注册样本的 LCP 晚于它约 80 ms；原生 LCP 仍独立参与门禁，不能把自定义就绪时间当作原生绘制时间。点击组在首页语义就绪后，还先完成至少 5 秒的原生观察窗口（且就绪后至少 1 秒、LCP 静默至少 1 秒），再滚动入口并停留 2 秒后实际点击；这给两侧预取充分机会，不能推广为入口刚出现就立即点击的体验。

v2 第一轮桌面冷访问的原始 `observation.entries.lcp` 进一步说明这个区别：首页最终 LCP 候选为 `BUTTON`，文本候选的 `url` 为空；关于页候选为页头的 `IMG`，路径为 `/icons/icon.svg`（基线来自主域，改进版来自独立 CDN），并非主背景。这些样本的原生 LCP 分别约 0.93 秒、1.03 秒，而语义内容就绪约 1.2 秒、1.65 秒。两侧候选均有非零 `renderTime`，不是跨域缺少绘制数据后仅使用 `loadTime` 的替代值。脱敏摘录为 `artifacts/performance/lcp-interpretation-v2.json`，来源为正式 raw 的第一轮样本；它只解释指标含义，不是全矩阵结论。最终结果必须并列报告原生 LCP 与语义内容就绪，不能称“完整首屏约 1 秒”。

SPA 点击导航不会生成新的传统 document Navigation Timing；不能把首页的 LCP/FCP 复制成关于页性能。使用点击到目标业务就绪的自定义指标独立报告。短测试中的 Event Timing 只代表被执行的交互，并非真实用户整个访问周期的 INP；INP 关注下一次绘制响应，也不包含所有异步业务完成时间。[INP 定义](https://web.dev/articles/inp)

禁止用 `waitForLoadState('networkidle')` 作为首屏结束条件；轮询、分析脚本和长连接均会扭曲它。网络收集可以有固定观察窗口，但必须与用户可见时间分开。[Playwright 等待状态说明](https://playwright.dev/docs/api/class-page#page-wait-for-load-state)

## 预先冻结的回归判据

以下是建议在执行前固定的**本项目实验容差**，不是官方保证的“无退化”阈值。不得看到结果后为了通过而放宽。每个页面 × 设备 × 缓存 × 网络组合先进行不计分的对称准备，再做至少 10 对有效 A/B 样本；A/B、B/A 交替或以记录种子的平衡顺序执行。原始失败与超时保留，不删除最慢值或只报告最快一轮。

- LCP、首屏完整可见与 click-to-ready：时间容差固定为 `max(100 ms, 基线 p50 × 10%)`；p75 增量也必须在该容差内。
- `emailFeedbackMs` 与 `menuFeedbackMs` 的容差为 `max(20 ms, 基线 p50 × 10%)`。重复表达目标页面就绪时间的 `interactionReadyMs` 已移除；没有采集下一绘制的 Event Timing，不为 INP 填写通过结论。
- CLS：p75 增量不超过 0.02，并将改进版超过 0.1 单独标为体验目标未满足；前后都差不能写成体验良好。[CLS 定义](https://web.dev/articles/cls)
- 每组同时提供 p50、p75、最大值、失败数与成对差值。采集器采用 5,000 次配对 bootstrap，随机种子固定为 `20261003`，分别计算两侧中位数差和 p75 差的 95% percentile 区间：至少 10 对完整样本、两个区间上界均在容差内、after p75 点估计增量同样在容差内且所有业务断言通过才判 `PASS`。任一区间下界已超过容差记 `FAIL`，区间跨界或样本不足记 `INCONCLUSIVE` 并追加样本；5 对可以用于诊断，但不能判通过。此区间是有限实验样本估计，不是线上所有用户的保证。
- 业务内容缺失、不可交互、图片损坏、CORS/JS 异常或导航失败直接失败，不允许用更快的错误页获得性能通过。

LCP 2.5 秒、INP 200 ms 和 CLS 0.1 是官方面向真实用户 p75 的良好体验参考。本地模拟样本可对照目标，但不能伪称已经通过真实用户 Core Web Vitals；压力环境中的绝对体验和相对回归结论分开呈现。[LCP 目标](https://web.dev/articles/lcp)、[INP 目标](https://web.dev/articles/inp)

## 第一候选版本的诊断与修复

`artifacts/performance/smoke-775724ea2239/` 完成两轮、64 个样本，使用固定压力配置、正常动画、SW 禁用。首页、关于页与学校邮箱注册页进行了冷暖访问，另测首页至关于页/注册入口的点击。没有功能断言失败；样本量不足，统计门禁总体为 **INCONCLUSIVE**。

| 实际点击：首页 → 关于页 | Git HEAD 中位数 | 第一候选中位数 | 四次配对观察的增量范围 |
| --- | ---: | ---: | ---: |
| 桌面（2 对） | 330.2 ms | 1,355.45 ms | +1,017.4 至 +1,033.1 ms |
| 移动视口（2 对） | 322.0 ms | 1,368.55 ms | +1,041.6 至 +1,051.5 ms |

这是可信点击至目标内容可见的时间，不能称为关于页 LCP。两侧瀑布显示，基线在点击前下载约 941,836 B 的关于页背景，第一候选在点击后才下载约 941,860 B；四个样本方向一致，定位到关闭预取造成的工作转移。证据为 `about-click-diagnosis.json`、`raw.json` 与 `summary.json`，不把两轮样本扩大为正式统计通过或线上普遍结论。

据此只恢复首页 hero 的 `/about` 链接预取，其余入口继续保持既定行为。背景仍从独立 CDN 获取。重新采集的 `artifacts/usage/performance-fixed/browser-usage.json` 包含 14 组资源样本与真实 PWA 安装：首页冷、热访问均为 5 个 Vercel 请求，新增 2 个关于页 RSC 预取；其他冷页面为 3 个。独立 CDN 的首页请求包含提前下载的背景，真实 PWA 首次安装另有 3 个主域请求。该资源报告仍然不提供 LCP 结论。

预算已按新证据重算：在 50,000 PV、全部浏览器冷访问、100% ISR 持久缓存未命中及既定规划假设下，预测 Vercel CDN Requests 为 **770,520/月，保留 22.948%**，该项条件 PV 上限为 **52,035/月**；追加另一项目历史校准包络后是 **775,520 请求/月、22.448% 余量、51,690 PV/月**。Sentry、动态页成本、部署存储与其他项目未来成本未验证的边界见[用量预算](../plans/2026-10-03-vercel-hobby-budget.md)。已建模月度指标通过不代表完整预算通过，存储与账户门禁仍未通过。不能再沿用第一候选的 650,520 请求/月或 62,370 PV 条件容量。新冻结版本的 10 对、480 个样本正式比较结果见下文。

首次正式采集目录 `artifacts/performance/formal-8c52933a4a23/` 在独立审阅后中止：采集器对尚未结束的背景图片 decoder 处理不充分，点击前启动、点击后结束的请求可能漏记失败。该目录保留诊断证据，不计入最终通过样本，也不与修正后的测量混合。产品源码没有因这次采集器修正变化；正式结论只采用新目录内的完整重跑。

修正版从零采集到 `artifacts/performance/formal-v2-8c52933a4a23/`，使用 `schemaVersion=2`、`measurementRevision=decode-readiness-complete-journey-v2`。其 `harness-source/manifest.json` 的聚合 SHA-256 为 `f2c5029e71276aa4e3408785d307d99e675d4dd3c31867b95cd789e7cd3be126`。业务就绪时，所有已经启动的图片 decode 都必须成功完成，并把当时的 decode 证据冻结；点击导航另保存目标页观察。请求记录贯穿整个点击路径，预取中途跨越点击时间的请求仍能在后续失败时被识别，点击后流量使用时间切片统计而不清空记录。旧目录的 80 个中断样本没有复用；新矩阵已完整完成。

## 正式 v2 固定压力结果

`formal-v2-8c52933a4a23` 于 2026-10-02 19:12:18 UTC 完成（本地日期为 2026-10-03），Chromium `148.0.7778.96`。10 轮配对合计 **480/480 样本**，**120/120 指标组 PASS**，没有失败样本、重复样本、无效就绪 decode 或缺失的点击目标观察；进程退出码为 `0`。`summary.json`、`raw.json` 与 `evidence-audit.json` 保存原始值和审计，前两次诊断/中止运行没有并入统计。

下表全部为 **毫秒，Git HEAD 基线 → 改进版**；每个场景各有 10 对。原生 LCP 和自定义语义就绪分别展示，所有 p50/p75 差值的 bootstrap 区间均满足预先声明的容差。完整 FCP、TTFB、CLS、区间与逐轮值保留在 `summary.json`，表中数值只四舍五入到 0.1 ms。

| 视口 | 路由 / 缓存 | LCP p50 | LCP p75 | 语义就绪 p50 | 语义就绪 p75 |
| --- | --- | ---: | ---: | ---: | ---: |
| 桌面 | / / 冷 | 922 → 924 | 930 → 927 | 1185.5 → 1186.7 | 1191.7 → 1191.3 |
| 桌面 | / / 暖 | 260 → 260 | 260 → 260 | 514.5 → 520.4 | 522.4 → 527.6 |
| 桌面 | /about / 冷 | 1028 → 1028 | 1028 → 1028 | 1659.1 → 1650.2 | 1664.1 → 1655.2 |
| 桌面 | /about / 暖 | 348 → 188 | 348 → 192 | 495.3 → 494.8 | 497.8 → 496.3 |
| 桌面 | /schools / 冷 | 856 → 856 | 859 → 859 | 886 → 883.4 | 889.4 → 884.5 |
| 桌面 | /schools / 暖 | 352 → 200 | 356 → 200 | 438.9 → 442.1 | 441.3 → 446.4 |
| 桌面 | /register / 冷 | 1028 → 1028 | 1031 → 1031 | 918.9 → 943.4 | 924.5 → 946.4 |
| 桌面 | /register / 暖 | 200 → 200 | 204 → 203 | 717.5 → 716 | 721.8 → 719.6 |
| 桌面 | /register/school / 冷 | 1044 → 1046 | 1044 → 1051 | 938.5 → 989.2 | 944.5 → 996.1 |
| 桌面 | /register/school / 暖 | 204 → 204 | 204 → 214 | 723.3 → 723.4 | 726.4 → 735 |
| 移动 | / / 冷 | 916 → 916 | 919 → 922 | 1172.5 → 1181.2 | 1181.9 → 1183.4 |
| 移动 | / / 暖 | 264 → 264 | 264 → 264 | 518.9 → 518.5 | 523.3 → 520.8 |
| 移动 | /about / 冷 | 1032 → 1032 | 1032 → 1036 | 1661.4 → 1645.2 | 1662.3 → 1648.8 |
| 移动 | /about / 暖 | 346 → 204 | 348 → 215 | 493.6 → 498.6 | 499.2 → 499.3 |
| 移动 | /schools / 冷 | 920 → 920 | 924 → 923 | 922.3 → 924.2 | 926.2 → 926.5 |
| 移动 | /schools / 暖 | 356 → 216 | 356 → 216 | 455.4 → 457.9 | 460.4 → 461 |
| 移动 | /register / 冷 | 1032 → 1032 | 1032 → 1032 | 922 → 947.5 | 926.6 → 952.4 |
| 移动 | /register / 暖 | 216 → 220 | 227 → 224 | 734.5 → 736.5 | 739 → 741 |
| 移动 | /register/school / 冷 | 1048 → 1048 | 1051 → 1048 | 941.8 → 992.5 | 943.9 → 995.2 |
| 移动 | /register/school / 暖 | 220 → 220 | 227 → 226 | 740.1 → 738.4 | 744.1 → 740.6 |

| 视口 / 导航 | p50 | p75 | p75 差值 95% CI | 判定 |
| --- | ---: | ---: | --- | --- |
| desktop/click-home-about | 326.4 → 326.2 | 327.1 → 331.6 | -1.4 至 17.9 | PASS |
| desktop/click-home-register | 882.3 → 880.5 | 882.8 → 884.5 | -5.7 至 6.2 | PASS |
| mobile/click-home-about | 317.7 → 318.1 | 318.2 → 318.5 | -2.1 至 5.4 | PASS |
| mobile/click-home-register | 880 → 882.5 | 882.6 → 884.5 | -2 至 8.3 | PASS |

| 视口 / 场景 | 反馈 | p50 | p75 | 判定 |
| --- | --- | ---: | ---: | --- |
| desktop/cold-register-school | 学校匹配反馈 | 10.6 → 10.3 | 11.1 → 10.6 | PASS |
| desktop/warm-register-school | 学校匹配反馈 | 6.8 → 7 | 7.5 → 7.5 | PASS |
| mobile/cold-home | 菜单可见反馈 | 177.6 → 177.5 | 177.9 → 177.8 | PASS |
| mobile/warm-home | 菜单可见反馈 | 161.3 → 162.9 | 162.3 → 163.4 | PASS |
| mobile/cold-about | 菜单可见反馈 | 177.7 → 177.4 | 177.8 → 177.8 | PASS |
| mobile/warm-about | 菜单可见反馈 | 162.8 → 162.2 | 163.5 → 162.7 | PASS |
| mobile/cold-schools | 菜单可见反馈 | 176.8 → 177.5 | 178.1 → 178.1 | PASS |
| mobile/warm-schools | 菜单可见反馈 | 161.6 → 162.7 | 162 → 163 | PASS |
| mobile/cold-register | 菜单可见反馈 | 178.1 → 177.1 | 178.3 → 177.4 | PASS |
| mobile/warm-register | 菜单可见反馈 | 162.3 → 162.9 | 163.3 → 163.1 | PASS |
| mobile/cold-register-school | 菜单可见反馈 | 178.2 → 177.8 | 178.7 → 178.9 | PASS |
| mobile/cold-register-school | 学校匹配反馈 | 10.7 → 10.1 | 11.3 → 10.4 | PASS |
| mobile/warm-register-school | 菜单可见反馈 | 163.4 → 163.6 | 168.7 → 170.7 | PASS |
| mobile/warm-register-school | 学校匹配反馈 | 7.1 → 6.7 | 7.8 → 7.3 | PASS |
| mobile/click-home-about | 菜单可见反馈 | 163.2 → 162.5 | 163.8 → 163.3 | PASS |
| mobile/click-home-register | 菜单可见反馈 | 163.4 → 162.4 | 163.7 → 163.2 | PASS |

学校邮箱反馈和菜单可见反馈均为自定义用户动作耗时，不能称为 INP。导航表使用已给充分预取机会的点击；立即点击另外验证。

通过不表示所有值相同：学校注册页冷访问语义就绪的桌面 p75 从 **944.5 增至 996.1 ms**，差值 **+51.6 ms**，95% 区间为 **+40.4 至 +63.8 ms**，低于预先固定的 100 ms 容差；移动视口同项约增加 51 ms。LCP p75 最大正增量为桌面暖学校注册页的 **10 ms**，区间为 **−4 至 +12 ms**。改进版全部初始 CLS p75 均为 0；这不覆盖后续 60 秒刷新或完整会话。

当前 loopback 中原生 TTFB 仅数毫秒，而部分响应传输阶段约 164–170 ms。150 ms 是 CDP 的节流参数，不是已经实测的生产 RTT；不能将本地 TTFB 投射到真实地区网络。

实际正式命令如下；复现时必须先启动新的同条件服务并替换过期 session，不能直接重用历史端口和目录：

```sh
node scripts/performance/compare.mjs --before-session artifacts/performance/baseline-8c52933a4a23/comparison-session.json --after-session artifacts/e2e/8c52933a4a23/session.json --before-label HEAD-97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89 --after-label working-tree-sha256-440750a9b469d9dec45ac8375e2e5786a7820c22104e0a147d515cd33066780a --before-cdn-url http://127.0.0.1:61081 --rounds 10 --viewports desktop,mobile --routes home,about,schools,register,register-school --profile mobile-pressure --output artifacts/performance/formal-v2-8c52933a4a23
node scripts/performance/summarize.mjs artifacts/performance/formal-v2-8c52933a4a23/raw.json
```

### 采集器故障识别

`artifacts/performance/collector-faults-v2-8c52933a4a23/failure-contracts.json` 的两项拒绝行为通过，验证的是采集器能识别不完整页面，不是人为注入故障时页面正常：

| 故障 | 实际观察与正确判定 |
| --- | --- |
| 持续挂起关于页背景图片 | 产品超时后解除显示遮罩，但图片 decode 仍为 pending；采集器在 30 秒边界失败，`metrics=null`，没有用较早的文字/icon LCP 获得通过 |
| 点击前启动的预取在点击后失败 | 注册目标页可见，但完整请求记录仍发现 `/about` RSC 的 `net::ERR_FAILED`，样本以 `critical-resource-errors` 失败 |

```sh
node scripts/performance/validate-failures.mjs artifacts/e2e/8c52933a4a23/session.json artifacts/performance/collector-faults-v2-8c52933a4a23
```

### WebKit 加载与缓存头

`artifacts/performance/webkit-loading-8c52933a4a23/results.json` 完成隔离 WebKit 的桌面/移动视口共 10 项行为检查：**8 通过、2 失败，0 跳过或 flaky**。正常动画和减少动画下，挂起图片保持加载状态、成功后内容可见，以及失败/超时的有界回退均通过。两项冷暖导航用例实际请求本地独立 CDN 的带 hash 背景地址，收到 `Cache-Control: public, max-age=3600`，与原有 `immutable` 契约不符，因此失败；不能把主站图片响应头代替实际 CDN 响应头。失败截图、trace 与视频保留在原目录；随后修复并定向复验如下。

```sh
node scripts/performance/run-webkit.mjs artifacts/e2e/8c52933a4a23/session.json artifacts/performance/webkit-loading-8c52933a4a23
```

这是隔离 WebKit 引擎的加载行为检查，未执行 Safari 真实用户性能对照，也没有把 Playwright 断言完成时间称为 LCP。主矩阵仍对应原冻结静态缓存头策略，不能自动把旧矩阵标为新包的完整复验。

缓存头修复后的新隔离 run `5ce63bfa2718` 只复跑上述两个失败用例，**2/2 通过**。实际执行命令是：

```sh
node scripts/e2e/run.mjs e2e/specs/loading-performance.spec.ts --project=webkit --project=mobile-webkit --workers=1 --grep 'complete artwork cold and warm navigation evidence'
```

实际 WebKit `26.4`，桌面 1280×800、移动 390×664，减少动画、无节流 loopback、SW 禁用；本地独立 CDN 服务的带 hash 背景资源返回 `immutable`，两侧冷/暖内容可见断言通过。证据为 `artifacts/e2e/5ce63bfa2718/results.json` 与 `artifacts/performance/cdn-cache-fix-5ce63bfa2718/webkit-evidence.json`。`completeVisibleMs` 含断言轮询，不作为 LCP 或正式性能比较。原来的 8 PASS/2 FAIL 与本次定向 2 PASS 分开保留，不能伪写成单次 10/10 或新版本重跑了 480 样本。

`cdn-cache-fix-5ce63bfa2718/source.tar.gz` 的 SHA-256 为 `4cbbe3b45609ece015e137e598d224cb19f7b8936cc21ae5dfa53a1e1b8808be`。它是**测试后的工作树快照**，不是已被运行器清理的源码副本；`source-comparison.json` 记录 Web/shared 与正式归档一致，只有 3 个 CDN 脚本修改、1 个新增。实际生成的 CDN 包仍保留在新 run 工件下，共 1,222 文件、52,332,120 B、50 条 header rules。没有重新采样完整正式矩阵，缓存头修复只取得上述定向行为证据。

旧 `8c52933a4a23` 服务已定向清理，端口和容器均归零，生命周期证据保存在 `artifacts/performance/lifecycle-8c52933a4a23.json`。历史端口不可继续当成运行中的验收环境。

### 立即点击补充组

额外使用 `immediate-click-after-source-ready-v1` 方法：首页语义就绪后只执行必要的滚动和定位器动作并触发可信点击，没有 5 秒原生观察窗口或固定 2 秒停留；记录真实 source-ready 到 click 的间隔。实际完成 10 对 × 桌面/移动 × 关于页/注册入口 × 两版本，共 **80/80 样本、4/4 指标组 PASS，0 功能或关键资源失败**。于 2026-10-02 19:24:20 UTC 结束，使用 Chromium `148.0.7778.96`，沿用固定压力与原门槛。它只有 `clickToContentReadyMs`，不填写 SPA LCP 或 INP，也不与正式主矩阵合并。

```sh
node scripts/performance/early-click.mjs --before-session artifacts/performance/baseline-8c52933a4a23/comparison-session.json --after-session artifacts/e2e/8c52933a4a23/session.json --before-label HEAD-97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89 --after-label working-tree-sha256-440750a9b469d9dec45ac8375e2e5786a7820c22104e0a147d515cd33066780a --before-cdn-url http://127.0.0.1:61081 --rounds 10 --viewports desktop,mobile --profile mobile-pressure --output artifacts/performance/early-click-8c52933a4a23
```

采集器源码与 manifest 随该目录单独冻结，聚合 SHA-256 为 `00b88b46c5ec0c151772aaa4187cce076310098d100837c812c8ab220d2c94ff`。`summary.json` 与 `raw.json` 保留以下毫秒值与区间，均为 Git HEAD 基线 → 改进版。

| 视口 / 立即点击目标 | p50 | p75 | 中位数差 95% CI | p75 差 95% CI | 判定 |
| --- | ---: | ---: | --- | --- | --- |
| desktop/immediate-home-about | 836 → 867 | 848.7 → 873.7 | 10.4 至 37.2 | -32.8 至 39.6 | PASS |
| desktop/immediate-home-register | 1007.8 → 883.5 | 1013.2 → 891 | -131.3 至 -101.8 | -132 至 -115.9 | PASS |
| mobile/immediate-home-about | 855.4 → 876 | 859 → 885.8 | 12.6 至 38.4 | -33.9 至 37.8 | PASS |
| mobile/immediate-home-register | 1007.5 → 883.1 | 1009.1 → 888.6 | -127.7 至 -116 | -131.7 至 -115.3 | PASS |

关于页立即点击的中位数桌面增加 **31.1 ms**、移动增加 **20.6 ms**，两者的 95% 区间均大于 0，说明本实验观察到小幅变慢，只是仍在预先固定的 100 ms 容差内。注册入口同项约快 124 ms。源页 ready 至真实点击的中位数为 **224.1 → 224.7 ms**，全部范围 **116.9–238.6 ms**，未额外等待数秒；该间隔包含必要滚动和定位器操作，不代表用户在内容出现同一帧点击。

## 执行接口与应交付工件

现有改进版服务入口为 `node scripts/e2e/run.mjs --serve --serve-minutes=90 --extra-client-origin=http://127.0.0.1:61081`；预先确认该基线端口可用。基线 Web 使用 `node scripts/performance/serve-baseline.mjs <after-session.json> 61081`，它固定运行时 HEAD、校验真实 CORS，并生成 comparison-session。实际提交必须与上文基线一致，改变提交需明确记录。采集器由浏览器验收任务实现，接收 before/after session 或 URL、轮数、视口、网络 profile 与 output；接口与解释见 [性能采集器](../../scripts/performance/README.md)。冻结的 v2 采集器已支持基线 metadata 的 `beforeUrl`，正式运行通过 `--before-session` 读取它及有效期限。

采集命令的退出码约定为 PASS `0`、FAIL `1`、INCONCLUSIVE `2`，避免证据不足被自动门禁当作通过。原始 JSON 每样本原子保存，较重的 bootstrap 汇总在完整轮次或终态生成，避免采样间重复计算干扰。最终正式结果必须补充实际完整命令及两个来源标识，不使用过期 session。

服务辅助脚本已对 session 来源、12 位 runId、有效期限与空闲端口做前置检查，到期停止后不再启动新的构建，并对未响应 SIGTERM 的子进程设置 3 秒强制停止边界。`artifacts/performance/helper-boundaries.json` 记录 11 项手工 CLI 拒绝边界全部通过，包括失效/超长会话、缺失标识、占用端口及无效 CORS origin；这些检查没有启动构建或服务，只验证辅助脚本的拒绝行为。

性能工件应独立放在 `artifacts/performance/<run-id>/`：来源提交/工作树 hash、依赖与运行环境、合成数据摘要、网络/缓存/动画/SW设置、逐轮指标与失败原因、配对关系、统计方法与阈值、全部 origin 网络摘要、截图和必要 trace、总判定。只保存合成数据与脱敏路径，不保存凭据、原始 Cookie/认证头或生产响应正文。

当前未验证项：真实 CDN 直连路径、真实 Sentry 上传、物理手机、已安装 PWA 的性能与生产用户 p75。正式 v2 比较与两项采集器故障识别已完成；立即点击补充组也已完成；WebKit 缓存头修复已取得定向 2/2 复验；完整正式矩阵没有在该修复后重新运行。

当前测试包编译的是 loopback API/CDN 地址，不能直接上传用于真实外网验收；后续必须用真实域名重新构建配套预览，并重新验证实际网络、CORS 与缓存响应。
