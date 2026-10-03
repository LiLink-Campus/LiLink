---
kind: changelog
lang: zh
---

# 保留 Vercel 的 ISR 控制与验收

> 文档归属：[验收记录](README.md)。本记录对应 2026-10-04 未提交工作树；取代前一轮独立静态 CDN 与接收端无持久去重的方案。现行行为见[公开缓存契约](../reference/public-data-cache.md)，预算见[Hobby 方案](../plans/2026-10-03-vercel-hobby-budget.md)。

## 本轮结果与边界

前端、图片、JS、CSS、字体继续留在 Vercel。删除外部 assetPrefix、图片 loader、URL 包装和独立 CDN 测试服务；保留此前 WebP 压缩、旧图片地址重定向、默认 Next Image 与同源 PWA。未引入 Cloudflare 资源交付、SSE 或浏览器统计轮询。

用户确认首页服务端普通统计允许约 30 分钟延迟。事务队列合并普通变化；API 数据库按 scope 原子领取 revision，重复及旧 revision 不再失效，新 revision 与 urgent 均受 30 分钟领取间隔约束。429 延后待办，不消耗故障尝试；故障仍有界重试。小时 TTL 仅提供漏通知后的访问恢复机会。

领取先于外部失效。领取成功后 Web 崩溃可能漏掉一次失效，重试得到 duplicate；明确不承诺 exactly-once 或固定故障恢复时限。当前单 API 实例缓存有效；扩容前需同步各 API 实例的公开内存快照。

本地行为与预算通过不等于生产写入达标，也不能确认中国大陆性能不退化。此次未 commit、push、merge 或部署，真实生产候选 A/B 与部署后用量仍待验收。

## 隔离 E2E

环境为 macOS arm64、Node 24.20.0、npm 11.19.0、Next 16.3.5，Chromium 与 WebKit 的桌面及移动视口。使用真实生产构建、Nest API、迁移后 disposable PostgreSQL/Mailpit、合成账号与临时签名密钥，未连接开发或生产数据库。移动项目是模拟视口，不代表实体 iPhone 或已安装 Safari。

首次广泛运行 `08e7b9f2af0b` 为 85 通过、13 失败、2 跳过，保留原始报告。失败暴露了队列首次 dueAt 在连续变化时漂移，以及三项验收问题：合法构建初始统计零值被误判、独立接收进程启动目录错误、可选本地遥测 404 被混入资源断言。修复实际调度问题与这些验收问题后，重跑相关核心四组。

最终核心运行 `6ab28cd11585` 为 **36/36 通过，零失败、零 flaky**；四引擎配置各九项。所有写入专项均有 11 条成功断言，观测错误为空。

| 可观察行为 | 四个项目的结果 |
| --- | --- |
| 稳定快照 100 次读取，含 20 并发 | 全部 HIT，同 HTML hash，零 route/Data Cache 文件重写 |
| 后台 UI 真正修改轮次，dispatcher 遇接收端 429 | attempts、ack、claimed 未变，待办保留，页面仍 HIT，无重写 |
| 延期后进入有效窗口 | 真实投递确认，重载页面显示已提交的新时间；观察一版 HTML 与一版 Data Cache |
| 真正失效后六秒不访问 | 无首页文件重写，回调本身不立即重生页面 |
| 失效后 20 并发访问 | 业务内容收敛，最终 HIT；观察一版新 HTML 与一版 Data Cache |
| 三轮同 revision、一次旧 revision 重放 | 均不失效、不改写缓存 |
| 20 个并发合法回调 | 均 200，仅一次 invalidated=true |
| 独立 Web 接收进程与其重启 | 均识别 duplicate，持久领取时钟和版本不变 |
| API 暂停与恢复 | 已有快照保留；新的领取调用失败不会失效；恢复后内容收敛 |
| 开页停留、隐藏后恢复 | 页面显示快照，不新增统计轮询或 SSE |
| 首页、About、学校及注册导航 | 实际文字、图片解码、hydration 与同源 JS/CSS/字体成功 |

同次写入专项额外领取一个业务未变化的新 revision，仍观察到 trace metadata 变化及文件重写；预算没有把这种情况视为零 ISR Writes。磁盘 20 ms 采样与 fs.watch 可能合并快速写入，观察版本是下界，不能直接换算 Vercel 账单。

四项目的独立 JSON 在 `artifacts/e2e/6ab28cd11585/results/isr-write-budget-*/attachments/isr-write-measurement-*.json`。共同的 `isr-write-evidence/files/` 使用内容 hash 保存原始版本；主 `evidence.json` 仅保留最后一个项目，不能替代四份附件。汇总为 `artifacts/isr-vercel-20261004/core-acceptance.json`；原始报告、trace、截图与运行参数在各自 run 目录。

首次广泛运行中的注册/邮件/登录、资料保存与刷新、匹配参与及结果、首屏预加载、PWA 用例通过；这些是该次运行中通过的用例，不能把整次失败的运行称为全通过。两个跳过是 WebKit 全局离线模拟的 Playwright 已知限制；独立 origin 不可达的离线页路径在四项目均验证。静态资源切换后的 PWA 安装、升级及安装失败保留旧 worker 均有独立证据。

```sh
node scripts/e2e/run.mjs community.spec.ts home-cache-stability.spec.ts isr-write-budget.spec.ts vercel-assets.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit --grep @smoke
node scripts/e2e/run.mjs home-artwork-preload.spec.ts auth.spec.ts matching.spec.ts profile.spec.ts pwa.spec.ts pwa-origin-failure.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit --grep @smoke
```

需先安装依赖与对应 Playwright 引擎，Docker 可用。runner 自建并清理本次服务。专项为了在有限时间内覆盖真实延期/恢复，仅前移 disposable 队列 dueAt/尝试/领取时钟；生产常量未修改，不能称为已经连续观察满 30 分钟或一个月。

## Storybook 场景

删除与服务端快照展示不再相符的 MSW 统计接口 handler 后，Storybook 类型检查通过，公开页面和统计的既有浏览器场景 **22/22 通过**，无跳过。原始结果和日志为 `artifacts/isr-vercel-20261004/storybook-results.json`、`storybook.log`，精简摘要为 `storybook-summary.json`。

18 个场景仍报告颜色对比度警告，保留完整 axe 结果；此次没有修改品牌颜色，不能把场景交互通过解释为完整无障碍验收通过。Storybook 的图片组件 mock 另有质量与 lazy LCP 提示，实际构建的图片行为以隔离 E2E 及性能采样为准。

```sh
npm run typecheck:storybook:web
npm run test:storybook:web -- --run apps/web/src/app/community-stats.stories.tsx apps/web/src/stories/public-pages.stories.tsx --reporter=default --reporter=json --outputFile=artifacts/isr-vercel-20261004/storybook-results.json
```

## 本地性能对照

同一 disposable API 与合成数据下，旧生产 Git 元数据 SHA 的重建服务和候选生产构建串行采样。桌面及移动视口均使用隔离 Chromium、150 ms 网络延迟、10 Mbps 下载、2 Mbps 上传和 4× CPU 压力；保留正常动画，阻止 service worker。每单元十对 A/B、B/A，浏览器冷/暖缓存分别记录，服务端缓存未清空。此环境不能代表中国大陆网络。

| 独立组 | 内容 | 样本 | 指标门禁 |
| --- | --- | ---: | --- |
| `comparison-760ab83a640e` | 首页、About、学校邮箱注册的冷/暖访问；首页到 About/注册点击 | 320/320 | 76/76 PASS |
| `comparison-public-completion-760ab83a640e` | 学校、注册方式的冷/暖访问；重复采集相同点击路径 | 240/240 | 50/50 PASS |
| `early-click-760ab83a640e` | 首页就绪、必要滚动后立即点击 About/注册；不增加观测停留或 dwell | 80/80 | 4/4 点击指标 PASS |

三组均无行为、JS 或关键资源失败。分组 `raw.json`、`summary.json`、`summary.md` 和第一轮截图保留在 `artifacts/isr-vercel-20261004/performance/`，没有将原始矩阵拼成一份或隐藏失败样本。提前点击组只比较可信点击到目标内容就绪，不借用 SPA FCP/LCP/INP；源页就绪到点击的中位数为基线 224 ms、候选 224.35 ms，含必要滚动与自动化操作开销。

预声明门限为计时的 `max(100 ms, 旧中位数的 10%)`、UI 反馈的 `max(20 ms, 10%)`、CLS 差 0.02 且新 p75 ≤0.1。十个完整配对、中位数与 p75 配对 bootstrap 95% 区间上界及 p75 实际差同时满足门限，才可 PASS；不满足证据量为 INCONCLUSIVE。这里使用显式 1000 ms 最短观测窗口，另要求语义就绪后至少一秒且 LCP 静默一秒；不代表完整浏览会话 CLS、INP 或实际移动设备。

候选实际来源摘要为 `6c2fca6c17759f90b9db6e02f74b63a5e7bf74adbffbda30d888a38bf91b8c55`，共 487 文件；源码归档与 hash 清单位于 `source-post-cleanup-760ab83a640e/`。最终 checkout 与这份应用源码清单相比，唯一后续变化是删除 Storybook MSW handler，已单独通过 22 场景及 lint；它没有改写已采样服务的源摘要。

复现时先创建新的未过期 session，以下 `RUN` 换成本次 runner 输出的 runId；基线 SHA 必须重新核对当前生产元数据。runner 和基线需在两个终端保活，测试完成后各自 Ctrl-C 清理其拥有的临时服务。

```sh
node scripts/e2e/run.mjs --serve --serve-minutes=90 --extra-client-origin=http://127.0.0.1:61081
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61081 a4f91a47cda9836e1d3f7c100d12fba12af4230c
node scripts/performance/compare.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --rounds 10 --profile mobile-pressure --routes home,about,register-school --observation-ms 1000 --output artifacts/performance/main-RUN
node scripts/performance/compare.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --rounds 10 --profile mobile-pressure --routes schools,register --observation-ms 1000 --output artifacts/performance/completion-RUN
node scripts/performance/early-click.mjs --before-session artifacts/performance/baseline-RUN/comparison-session.json --after-session artifacts/e2e/RUN/session.json --rounds 10 --profile mobile-pressure --output artifacts/performance/early-click-RUN
node scripts/performance/summarize.mjs artifacts/performance/main-RUN/raw.json
```

## 视觉复核与工件

Codex in-app browser 在 1280×800 和 390×844 检查首页、About、移动导航、学校徽标、注册方式及学校邮箱表单。图片显示正常、文字换行和控件宽度可用；注册表单无横向溢出。保留 `artifacts/isr-vercel-20261004/iab/` 截图。自动化 Chromium/WebKit 的导航和业务截图独立保存，不与 IAB 混称同一引擎。

撤回方案遗留的 2190 个生成图片约 53.79 MB 已从 checkout 及性能候选 public 目录移至忽略工件 `retired-generated-assets/`，保留 relocation.json，可恢复。仅移走无任何资源请求引用的生成文件，当前所用 WebP 保留。最终源码和性能环境清单需要分别保存，不能把旧构建输出目录视为当前源目录。

## 写入与其他资源预算

50,000 PV、31 天、首页全部本地 route 文件按 22 单位/轮独立进位、1489 次领取上界、744 次 TTL 机会、150 次部署、其他本项目 ISR 10,000 单位预留与 1.2 系数下：单轮 **74,911.2**，两轮生成压力 **114,220.8**，输出单位翻倍 **137,822.4**。基本与两轮压力均低于 160,000 门禁；单位翻倍不同时叠加两轮生成承诺。其他团队未来用量未知，账号门禁不通过。

默认 ISR 模型的字节来源已经更新到最终四项目核心运行 `6ab28cd11585`：HTML 最大 64,548 B，RSC/full 各 28,356 B，page segment 27,015 B，metadata 165 B、tree 465 B，分别进位仍为 22 单位。Data Cache 文件单独记录，不重复加算为 ISR 账单。

ISR CLI 黑盒行为 27/27、全资源 CLI 21/21；验证逐对象进位、非法输入拒绝、硬间隔容量、压力门禁、未知不当零及超限退出。计算器在修改前列失败边界并保留失败工件；通过仅证明计算器契约。证据在 `artifacts/isr-vercel-20261004/budget/`。平台压缩、缓存对象划分与实际月写入仍未校准。[Vercel ISR 计量](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)

```sh
node scripts/usage/isr-write-budget.mjs scripts/usage/isr-write-50000pv.scenario.json --output artifacts/isr-vercel-20261004/budget/isr-report.json --check-project
node scripts/usage/verify-isr-write-budget.mjs artifacts/isr-vercel-20261004/budget/isr-cli-final
node scripts/usage/budget.mjs scripts/usage/hobby-50000pv.scenario.json --output artifacts/isr-vercel-20261004/budget/full-report.json --check-usage
node scripts/usage/verify-budget.mjs
```

全资源与账号门禁的失败/未知项应保留，不能为通过而删除未知成本，也不因此迁移资源到外部 CDN。

最终候选的资源账本为 `artifacts/isr-vercel-20261004/performance/usage-760ab83a640e/`，20/20 公开路由冷/暖捕获及 PWA 完成。Chromium 148.0.7778.96；没有外部静态 CDN 请求、优化图片 body 缺失或未归类异常。冷包络 50 请求、863,827 B 规划流量、59 个图片读取单位；暖包络 7 请求、10,012 B、零图片读取。六个暖快照保留未结束的更新日志 JSON 响应及 `networkSettled: false`；未采集尾部不是零。它是既有请求，不是新增 SSE。

加入明确的业务与遥测预留、31 天及 1.2 系数后，当前全冷情景 Vercel 请求数 **3,590,520**、图片持久缓存读取 10% miss **354,000**（全 miss **3,540,000**），分别超过 800,000 与 240,000 的 80% 预算线。FDT 预测 **58.619 GB**，低于 80 GB；50% 冷情景约 32.513 GB。整体全资源门禁实际退出 1，计算、保留存储、其他团队和实际账单仍未验证。历史 All Projects 存储/构建数据的来源时间已明确为 2026-10-02T19:26:38Z，而非本轮工具读取。

完整实际命令与三个独立性能组、账本来源/门禁/hash 保存在 `performance/local-comparison-results.md` 和 `local-comparison-audit.json`。最终输入更新后的 CLI 契约报告为 `budget/isr-cli-final-current/`（27/27）和 `budget/full-cli-final-current/`（21/21），先前报告一并保留。账本的单次来源绑定汇总脚本随原始数据保存，可重算本轮摘要；新 run 不得沿用其旧来源注记或覆盖旧 raw。

## 检查与环境清理

shared 构建、Prisma 客户端生成、API/Web 类型检查、对应 lint、两份修改 CSS 的语法检查和脚本 syntax 检查通过。Storybook 最后删除 handler 后另行通过类型、22 场景与该文件 lint。`git diff --check` 通过；`docs:check` 无诊断，`docs:verify` 为 143 份索引、零稳定诊断、一条 preview。人工复核 preview 指向历史性能记录第 108 行的“错误页面不能获得性能通过”验收规则，属于行为门禁，没有伪造测量。

核心 E2E 自动清理本次 PostgreSQL/Mailpit 与进程；性能基线和 `--serve` 候选按各自退出流程清理，仅操作本轮拥有的资源。截图、原始结果和源码归档留在忽略工件目录。未触发远程更新，CI 未运行，不能以本地检查代称 CI。

## 生产身份与下一阶段验收

只读 Vercel 元数据确认当前生产为 `dpl_DfhYuchM2VNX7dADebNBaCH7jg2J`，Git 元数据 SHA 为 `a4f91a47cda9836e1d3f7c100d12fba12af4230c`；当前 HEAD 不同。source=cli 的 Git 元数据不能证明上传时工作树干净，因此本地重建该 SHA 是代码对照，不能视为完全重现旧生产。

CLI 54.14.5 的 `vercel usage` 当前账期、按项目及过去 30 日请求均返回 `Costs not found (404)`；指定 Web 项目目录也相同。不能将不可读取解释为零 ISR Writes。保存命令、退出码和错误摘要，工具直接读取的生产账单基线仍缺失。

CLI 源码确认 usage 查询的是 `/v1/billing/charges` 成本记录，不能据本账号的 404 泛化为所有 Hobby 都不可读取。只读 schema 确认 ISR 写入单位指标后，一次 `vercel metrics` 查询被 Observability Plus 权限拒绝；没有反复尝试或升级方案。IAB 打开控制台后，页面读取连续超时，未取得 dashboard 计数。脱敏诊断见 `production-usage-diagnosis.json`、`production-usage-metrics-canary.json`；未知单位保留 null。[CLI 指标权限](https://vercel.com/docs/cli/metrics)

用户随后从内置浏览器的 Usage 页面提供 **9 月 21 日–10 月 3 日，ISR Writes 179K**。保存显示原文及范围于 `artifacts/isr-vercel-20261004/production-usage-user-baseline.json`，来源明确为用户报告，工具未独立读取该计数和项目范围；是否完整账期或截至当日的选定区间也未独立确认。按 K 显示近似为 179,000，已高于 160,000 目标约 19,000，约占规划 Hobby 200,000 额度的 89.5%。不从舍入显示和未确认的时间边界外推精确月量。

该读数属于尚未部署本轮候选的旧生产基线，不能当作本轮节省效果，也不能校准本地 22 单位/轮的计费对象；最终模型仍保持 `billingVerified: false`。

若 179K 是当前账期累计，已发生的写入不能回退，该账期的 160K 目标已超；需分别验收部署后增量和下个完整账期，不能把部署当作累计用量重置。

```sh
vercel usage --cwd apps/web --format json
vercel usage --group-by project --format json
vercel usage --from 2026-09-04 --to 2026-10-03 --breakdown daily --format json
```

后续发布先上线迁移及领取端 API，共享 secret 已配置、通知 URL 留空；再上线 Web，最后开启 API 通知 URL。真实凭据沿用现有 Docker secret 渠道。发布必须授权。

候选在 Vercel 可用后，固定旧/新 deployment，使用相同大陆浏览器出口交替 A/B、B/A，验收首屏、图片、点击及已授权隔离业务路径，保留错误与超时。采集 24–72 小时实际 ISR 增量、7 日趋势和 30 日累计，结合 PV、部署、领取/延期/重试数量重新外推；分别报告项目与共享账号。curl 的 CN 出口或本地压力模拟均不能代替此阶段。
