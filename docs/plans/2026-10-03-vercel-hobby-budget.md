---
kind: plan
lang: zh
---

# Vercel Hobby 用量与 ISR 控制方案

> 文档归属：[规划](README.md)。当前目标更新于 2026-10-04；保留 Vercel 现有前端与静态资源拓扑，独立 CDN 方案已撤回。历史测量见[原缓存/CDN 验收](../validation/2026-10-03-vercel-cache-cdn.md)与[WebP 验收](../validation/2026-10-04-webp-images.md)，不能作为当前候选生产验收。

## 目标与约束

每月 50,000 PV、31 天，ISR Writes 控制在 Hobby 200,000 单位的 80% 即 160,000 单位以内。图片、JS、CSS、字体全部由 Vercel 交付；不新增静态 CDN、SSE 或浏览器统计轮询。首次访问、图片加载、点击导航及关键业务稳定性必须对照当前生产验收。

## 当前实现与写入模型

首页与聚合公开 Data Cache 保留一小时 TTL 作为故障恢复机会，主要由 API 提交后通知 Web 按 tag 后台刷新。数据库事务触发器合并变化，接收端通过已有 API PostgreSQL 原子领取 revision；每 scope 两次领取间隔至少 30 分钟，紧急变化也遵守。重复或旧 revision 不再调用失效；新 revision 受限时保留待办，频率延期不消耗故障重试次数。领取后 Web 崩溃可能漏掉一次失效，由 TTL 与后续访问提供恢复机会；不是 exactly-once。当前部署仍要求单 API 实例，扩容前需处理各 API 实例的内存公开快照同步。

保守模型使用全部本地 route 文件的 22 单位/轮，含重叠 segment 与 metadata；这不是平台实际计费对象。31 天最多 1489 次领取，150 次部署、744 次 TTL 刷新机会，另预留本项目其他 ISR 路由 10,000 单位，再乘 1.2 不确定性系数。20% 免费额度余量由 160,000 门禁另行约束。

| 情景 | 月度项目写入单位预测 | 160,000 门禁 |
| --- | ---: | --- |
| 每次领取一轮再生成 | 74,911.2 | 通过 |
| 每次领取两轮再生成 | 114,220.8 | 通过 |
| 输出计量单位翻倍，单轮生成 | 137,822.4 | 通过 |

重试最多六次仍共用持久领取约束，不能再将六次 HTTP 投递等同于六次实际失效。两轮生成和单位翻倍不能同时解释为已覆盖所有压力；更多部署、更大输出、其他团队用量或未知平台条目必须重新计算。平台压缩、持久缓存对象分组、实际 ISR 写入次数仍需部署后校准。[ISR 官方计量](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)、[Hobby 额度](https://vercel.com/docs/plans/hobby)

本轮静态资源优化没有改变首页 TTL、领取间隔或失效策略。同会话 `f3c47b950f08` 的完整首页 route 文件在优化前后逐个按 8 KiB 向上取整，均为 22 单位；URL 与响应式图片标记仍会改变文件字节。全部本地预生成文件的相同保守包络从 217 增至 221 单位：学校页三份 RSC 表示各从 4 增至 6 单位，`_not-found` 合计减少 2 单位。它们是含重叠 segment 的本地文件包络，不是 Vercel 实际计费对象数，因此只能说首页此条件模型不变，不能承诺所有 ISR Writes 都不变。若每次部署写入完整包络，差异相当于 4 单位/部署；既有 10,000 单位本项目其他 ISR 成本预留保留，也不能将预留当作所有路由的计量证明。脱敏工件为 `artifacts/resource-optimization-20261004/row-split-cache-outputs/summary.json`，来自两份生产构建、每侧各 100 个完整且 配套文件一致的响应文件；原始字节副本同时保存。

```sh
node scripts/usage/isr-write-budget.mjs scripts/usage/isr-write-50000pv.scenario.json --output artifacts/isr-vercel-20261004/budget/isr-report.json --check-project
node scripts/usage/isr-write-budget.mjs scripts/usage/isr-write-50000pv.scenario.json --check-account
node scripts/usage/verify-isr-write-budget.mjs
```

项目门禁要求基本和两轮生成压力均通过。其他团队未来 ISR Writes 未知，账号门禁应退出 1，不能按零处理。

## 其他额度风险

默认全资源模型保持 Vercel-only，拒绝独立 CDN 输入。本轮将固定图片改为构建期响应式资源、学校校徽改为按需加载的四组 CSS 背景图集（2/3/10/13 个校徽），并为内容哈希图片、SVG、字体设置一年浏览器缓存。图片、JS、CSS、字体仍由 Vercel 提供。

最终按行分组背景方案的同一隔离会话 `f3c47b950f08`、候选源码摘要 `91a044cf209bdb844e2a879bb758af75b4b530085f391d14d199edd96021e075`、Chromium `148.0.7778.96`、相同视口与完整滚动路径，对照了优化前后的 20 组公开页面冷/暖样本。这里的冷仅表示浏览器缓存为空，不表示 Vercel 缓存未命中；暖样本使用相同浏览器缓存。工件为 `artifacts/resource-optimization-20261004/row-split-usage/{before,after}/browser-usage.json` 与 `row-split-comparison/summary.json`。

| 公开页观测包络 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 冷浏览器实际对 Web 发出的请求 | 50 | 29 |
| 暖浏览器实际对 Web 发出的请求 | 7 | 5 |
| 冷浏览器图片优化读取估算，8 KiB 单位 | 59 | 0 |
| 冷浏览器已观察 gzip/header 模型下界 | 862,080 B | 854,316 B |
| 暖浏览器已观察 gzip/header 模型下界 | 10,693 B | 9,510 B |
| 冷/暖浏览器完整规划交付字节 | UNKNOWN | UNKNOWN |

包络取各样本最大值，不是生产路由平均，也不能把最大请求数与最大流量误称同一次用户访问。所有采样公开页均不再请求 `/_next/image`，因而这部分动态图片优化读取估算为零；静态图片的 Vercel 交付请求与流量仍然存在。完整项目的私有或动态图片、平台持久缓存命中、真实遥测和账单仍未验证。两侧各六个暖访问的既有更新日志 JSON 响应未结束，本地 Vercel 遥测脚本也存在失败响应和缺失正文。2026-10-04 复审发现旧比较工具虽列出失败，却仍用部分字节算出有限预算；已修正为保留上述模型下界、完整交付字节及其预算均为 `UNKNOWN`。固定遥测预留不能证明未观测尾部已有上界，本地 gzip/header 模型也不是生产线上字节实测。原始采样与历史报告保留，纠正后的同源重算见 `artifacts/review/2026-10-04-usage/actual-comparison/summary.json`。

同条件压力对照只替换上述公开浏览器请求、流量及图片优化读取包络，保留 50,000 PV、31 天、1.2 系数、相同 PWA/遥测/Sentry/回调与其他业务预留、全冷/全失配/两轮再生成情景，以及未知团队和存储用量。默认模型显式保存 `after.publicBrowserEnvelope`，比较工具据该输入分离固定预留，避免模型更新后再减去旧包络导致负成本；缺失正文的流量证据继续传播为未知。加入这些预留后的条件预测如下：

| 项目 | 条件预测 | 保留 20% 的预算线 | 判断 |
| --- | ---: | ---: | --- |
| CDN Requests，50% 浏览器冷访问 | 2,180,520 → 1,490,520 | 800,000 | 仍有明显超限风险 |
| CDN Requests，全部浏览器冷访问 | 3,590,520 → 2,330,520 | 800,000 | 仍有明显超限风险 |
| 公开页 Image Cache Reads，全失配压力 | 3,540,000 → 0 | 240,000 | 公开页估算通过；全项目实际未知 |
| Fast Data Transfer，全部浏览器冷访问 | UNKNOWN → UNKNOWN | 80 GB | 正文证据不完整，不能判定通过 |

PWA worker 安装另有真实浏览器对照：首次安装额外观测到 4 个请求，包括 worker 脚本、离线页与两张 SVG 图标；未观测到的 manifest 请求不补成实测成本。生产页面会在 load 后自动注册 worker，因此这里的安装次数是各浏览器的首次安装与版本升级，不是用户点击“安装应用”的次数。默认模型继续保留旧的每 PV PWA 压力预留，便于同条件归因。单列的 session 校准模型按“月 worker 安装次数 × 安装额外成本 + 已安装重访次数 × 重访额外成本”计费，月安装与重访次数保持未知，升级成本也未当成零，因此请求和流量结论为 `UNKNOWN`，不能宣称该模型达标。真实遥测/Sentry 未削减；即使暂扣每 PV 的 PWA 压力预留，剩余条件请求预测仍约为 1.31M/2.03M，超过 800,000，不能靠 PWA 口径调整消除风险。

请求数风险不授权迁移静态 CDN，也不能仅用资源目录压缩率推算账单。CPU、内存、图像转换/写入、部署和函数存储、其他项目及实际命中率继续保留明确假设或未知证据，整体项目/账号门禁未通过。

```sh
node scripts/usage/budget.mjs scripts/usage/hobby-50000pv.scenario.json --output artifacts/resource-optimization-20261004/row-split-budget/full-report.json --check-usage
node scripts/usage/verify-budget.mjs artifacts/resource-optimization-20261004/row-split-budget/cli-verification
node scripts/usage/compare-browser.mjs artifacts/resource-optimization-20261004/row-split-usage/before/browser-usage.json artifacts/resource-optimization-20261004/row-split-usage/after/browser-usage.json artifacts/review/2026-10-04-usage/actual-comparison artifacts/resource-optimization-20261004/row-split-budget/comparison/source-model.json
node scripts/usage/verify-browser-comparison.mjs artifacts/review/2026-10-04-usage/comparison
node scripts/usage/verify-browser-capture.mjs artifacts/review/2026-10-04-usage/capture
```

完整模型实际退出 1，并显示失败与未知项目；既有预算 CLI 验证 22/22 通过，工件为 `artifacts/resource-optimization-20261004/row-split-budget/cli-verification/report.json`。比较 CLI 对缺失显式包络、负固定预留拒绝输出预算；新旧模型保留相同预留与月度压力，结果保存在同目录的 `comparison-cli/report.json`。冻结数值模型的 FDT 全冷 58.515 → 58.049 GB、50% 冷访问优化后 32.213 GB，仅描述忽略未知正文尾部的历史条件计算，不能作为当前完整流量预算通过证据；重新读取相同采样的比较工具会输出 `UNKNOWN`。比较结果保存完整 source-model 以便重生成；旧的无显式包络 frozen input 原件保留，带原始包络注释的兼容副本为 `artifacts/resource-optimization-20261004/frozen-source-model-with-envelope.json`。CPU/内存与图像转换/写入仍使用明确假设；历史 All Projects 仪表盘存储读数不能证明候选未来峰值或共享账号占用。

新增的比较 CLI 验收覆盖完整响应、未结束/失败/缺失正文、正文后来完成但原始快照仍不完整、304、浏览器缓存、直连 API 及伪完整路由矩阵边界，9/9 通过；双方即使有相同的 20 格，也必须包含约定的每个路由、视口与冷暖组合。采集 CLI 的临时 HTTP 故障验收 2/2 通过：拒绝连接在 168 ms、正文悬挂在 10,189 ms 非零退出，均无强制终止、无成功采样工件、无浏览器子进程残留。HTML/RSC 各自的 header 与 body 共用十秒超时，成功后才启动 Chromium。这两组工件位于上述 `comparison/report.json` 与 `capture/report.json`，使用合成 JSON 和临时本地 HTTP 服务，不构成业务 E2E、生产或性能验收。

## 为什么旧生产用量比压力模型低

历史脱敏仪表盘在 `artifacts/usage/vercel-dashboard-lilink.txt` 保存的 LiLink 项目读数是：展示窗口 9 月 2 日 13:00–10 月 2 日 13:00，CDN Requests 134K、Image Cache Reads 2.6K、ISR Writes 166K；采集日期为 10 月 2 日。这是旧生产实际累计，与 50,000 PV 的规划压力条件不同，当前用户规模、浏览器冷暖比例、路由构成和平台缓存情况尚未对齐。它离请求或图片读取额度较远，不证明扩至 50,000 PV 后仍有同等余量。

同一历史 All Projects 页面 138K 请求和 2.1K Web Analytics events 又有项目范围差异；Analytics events 受采样、事件类型和浏览器上报影响，不能直接当成 PV，也不能用 `134K ÷ 2.1K` 得出可靠的每 PV 请求成本。用户提供的 9 月 21 日–10 月 3 日 179K ISR Writes 使用另一个显示窗口，项目范围与完整账期尚待核对。三者必须独立保存，不能混合为同一生产基线或当成候选优化后的实测效果。

## 性能与生产验收

2026-10-04 发布前核验的生产 deployment 元数据 Git SHA 为 a4f91a47cda9836e1d3f7c100d12fba12af4230c，工作树 HEAD 为 97b6bcd33ef0a6e54b1d0d9dd1e1dbfdac99ca89。生产来自 CLI 上传，Git SHA 不能证明上传时没有未提交源码；本地重建该 SHA 只提供代码对照，真实生产基线应固定旧 deployment。

本地对照使用同一 disposable API、合成数据、实际生产构建、桌面和移动视口，记录首屏可见、图片解码、点击就绪及请求失败。真实大陆验收需固定同一出口、确认浏览器直连与 CN 来源、旧生产 deployment 和获授权候选交替 A/B 与 B/A；不能用 curl CN 探针、旧单站观察或本地速度宣称通过。

关键业务在隔离 E2E 验证注册/邮件/登录、资料保存及刷新、匹配参与和结果查看。不得向生产真实账号写入合成业务数据。

2026-10-04 用户已授权完成 review、修复、测试、commit、push 与生产发布。按精确候选的 CI 和恢复点核验结果推进：先发布包含两条新增 migration 和 claim 端点的 API，先配置共享通知 secret、URL 留空以保持发送关闭；再发布 Web 接收端，最后启用 API 通知 URL。维持既有 Docker secret 配置渠道，真实凭据不进入 Git。

部署后以精确 deployment/commit 核对 7 天趋势和 30 天累计 ISR Writes；记录基线、PV、部署次数、已领取 revision、重试/延期/耗尽任务与实际写单位，重算月度预测。160,000 项目目标和共享账号占用分别报告。生产用量需要发布后的观察窗口，真实大陆候选非退化需要专门的同出口对照；发布授权与本地通过均不能代替这两项验收。

旧生产用量已有用户提供的控制台基线：9 月 21 日–10 月 3 日显示 179K ISR Writes，近似为 179,000，超过 160,000 目标，约占 200,000 额度的 89.5%。工具未独立确认项目范围和完整账期边界，不精确外推月量；该基线采集时本轮候选尚未部署，不能将它解释为优化后的用量。原文、来源及时间范围保存在[本轮验收记录](../validation/2026-10-04-vercel-only-isr.md)引用的脱敏工件。

若该显示范围属于当前账期累计，已发生的写入不能回退，本账期 160,000 目标已超；优化验收应分别观察发布后的增量和下个完整账期，不能承诺部署后累计值自动低于目标。
