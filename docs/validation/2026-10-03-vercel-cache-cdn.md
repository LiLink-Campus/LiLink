---
kind: changelog
lang: zh
---

# Vercel 快照、失效与独立 CDN 本地验收

> 文档归属：[验收记录](README.md)。日期：2026-10-03。对象：当前未提交工作树，未 commit、push 或部署。

> 历史方案提示：本文保留当时 CDN 候选的原始数据和工件；该候选已撤回，当前前端与全部静态资源保留 Vercel，新实现与验收见[仅使用 Vercel 的 ISR 验收](2026-10-04-vercel-only-isr.md)。下列独立 CDN、旧轮询及旧重复通知行为不代表当前实现。历史命令中的 CDN 用例、脚本和 `--no-static-cdn` 参数均已退出当前 runner，不能作为现行运行指引。

各运行 ID 对应其采样时的版本；下列早期缓存、认证及 PWA 验收没有冒称在恢复预取后全部重跑。后续预取修复的源码标识、专项复测与性能结论由[公开页面性能记录](2026-10-03-public-performance.md)维护。

## 环境与数据前提

Node 24、npm 11、锁定依赖、Docker PostgreSQL 17 / Mailpit，所有 API/Web/CDN 服务均在 runner 随机 loopback 端口，独立 workspace 与 disposable 数据库。注册、后台轮次和学校数据为合成数据。签名密钥临时生成，不写入文档或工件。浏览器测试不连接真实账号，不控制个人 Chrome。

生产型 Next 构建与真实 Nest/Prisma/migration 配合；独立 CDN 是实际发布目录的本地 HTTP 服务，不能据此声称 Cloudflare 已上线或 Vercel 已节省。已将 Next Sentry wrapper 的配置段与 HEAD 逐字对比，完全一致；CDN 的 `crossOrigin: anonymous` 配合 CORS 以保留跨域脚本诊断。

## 行为验收

```sh
node scripts/e2e/run.mjs community.spec.ts home-cache-stability.spec.ts static-cdn.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit
node scripts/e2e/run.mjs auth.spec.ts static-cdn.spec.ts --project=chromium
node scripts/e2e/run.mjs static-cdn.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit
node scripts/e2e/run.mjs pwa.spec.ts static-cdn.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit
node scripts/e2e/run.mjs pwa-origin-failure.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit
```

主运行 `artifacts/e2e/fd32fec9d06d/`：四个浏览器项目 **36/36 通过**，包括：

- 服务端已有首屏统计；直接 API 请求不携带身份 Cookie，Vercel 同源社区轮询消失。
- 人数/轮次/底部提示共同恢复；合法响应更新，无效响应与故障保留旧值；隐藏暂停和重新可见恢复。
- 超过原 30 秒 TTL 后首页仍为 HIT，浏览器刷新不触发整页更新。
- 管理员真实界面修改轮次，数据库触发器、持久通知、Web tag 失效最终使服务端首屏及浏览器底部时间收敛。
- 错误签名、过期时间戳、未知 scope 和超长正文拒绝；事务回滚不留通知、突发写入合并。
- 暂停本轮 API 子进程直到真实服务端读取超时，旧首页仍可读取；恢复 API 后数据恢复。`finally` 恢复进程，runner 回收本轮资源。
- 首页、关于页、学校页和注册页的跨域脚本、样式、可见图片加载成功，没有 `/_next/image` 回源；内部导航正常，移动端无横向溢出。

补充运行 `artifacts/e2e/146c3f21fe9b/`：**10/10 通过**，覆盖注册登录、私有读取和新增 `crossOrigin` 的资源链。最初该场景因测试环境对所有请求附加 `cf-connecting-ip` 而触发人工 CORS 预检失败；修正的是隔离 CDN 服务的 OPTIONS 支持，真实静态包仍使用无凭据 CORS。没有通过降低产品断言隐藏失败。

最终 PWA/CORS 运行 `artifacts/e2e/6a96f5adac4f/`：**14 通过、2 显式跳过**。四种浏览器环境均验证真实 Service Worker 安装、旧缓存升级以及跨域脚本以 CORS 模式读取；桌面与移动 Chromium 另外通过全网离线模拟，实际显示离线页面和图标。WebKit 的两项全网离线模拟受 [Playwright 已知问题 #42775](https://github.com/microsoft/playwright/issues/42775) 阻断，没有算作通过。

为验证 WebKit 实际可见的降级结果，运行 `artifacts/e2e/387d886215c1/`，在每个测试独立 HTTP 源站安装项目真实 `sw.js`，随后关闭该源站，触发真实 connection refused。四种浏览器均显示项目离线页面，缓存 SVG 解码成功且无横向溢出，**4/4 通过**。该故障只影响本测试的独立源站，不等同于系统全网断网，也没有关闭共享 Web/API。报告包含 `origin-unreachable-offline.png` 与浏览器版本、断言工件。

故障路径最初使用 `revalidateTag(..., {expire:0})` 并硬失效 path，会在 API 超时时返回错误；黑盒失败被修复为 `'max'` 后台刷新，并真实等待服务端超时确认旧页面保留。这里的通过结论不只来自 HTTP 200 或构建成功。

## 视觉与资源测量

Codex in-app browser 人工检查 1280×800 桌面和 390×844 移动视口：首页首屏、数据图表、导航展开、关于页背景、学校图标、注册背景与表单。未见缺图、异常换行或横向溢出；截图位于 `artifacts/usage/iab/`。自动 Chromium/WebKit 报告保存图片与浏览器版本；没有宣称测试实体 iPhone 或用户安装的 Safari。

```sh
node scripts/e2e/run.mjs --serve --serve-minutes=30
node scripts/usage/capture-browser.mjs artifacts/e2e/<run-id>/session.json artifacts/usage/final
node scripts/usage/budget.mjs scripts/usage/hobby-50000pv.scenario.json --output artifacts/usage/usage-budget.json --check-usage
node scripts/usage/budget.mjs scripts/usage/hobby-50000pv.scenario.json --output artifacts/usage/budget.json --check-forecast
node scripts/usage/budget.mjs scripts/usage/hobby-50000pv.scenario.json --output artifacts/usage/account-budget.json --check-account
```

历史样本 `before` / `after` / `final` 各有注明运行 ID 的 `browser-usage.json`；`after` 是 CDN 实施前的中间实现。早期 CDN 候选使用 run `27416d8e7fad`，14 组桌面/移动冷暖导航采集，8 组公开页面冷访问均为 3 个 Vercel 请求，采样最大响应传输 15,787 bytes，另有请求头估算。独立 CDN 转移的请求单列，不计作凭空消失。主采样阻止 Service Worker，额外真实安装工件及 PWA 成本单独纳入模型。

后续[性能诊断](2026-10-03-public-performance.md)发现关闭关于页预取会拖慢点击后导航，已恢复首页“了解更多”这一条预取入口。当前候选 run `8c52933a4a23` 的 14 组采样保存在 `artifacts/usage/performance-fixed/`：首页冷/暖各 **5 个 Vercel 请求**，其他冷页面为 3 个；最大响应传输 20,925 B。该版本取代早期 `final` 的 3 请求包络，不能继续沿用旧预算。桌面与移动端首页进入关于页的 IAB 复核截图在 `artifacts/performance/iab/`。

早期 PWA 测量来自 run `3af5ab78b545`，保存在 `artifacts/usage/final/pwa-usage.json`；当前 `performance-fixed` 已重新安装验证，仍为每次全新安装新增 **3 个 Vercel 请求**（SW、manifest、offline HTML），两张图标由 CDN 读取并以同源键存入离线缓存。模型按每个冷 PV 都重新安装 PWA 计入，未因 Service Worker 命中而省略成本。

测算以 50,000 PV、31 天、20% 额度余量为验收线，再给预测成本乘 1.2。Sentry 转发、动态页面、PWA、回调最多 6 次尝试、其他 ISR 路由与机器人/preview 都有显式预算，并追加构建分钟数及部署/函数存储。当前 **14 项月度项目用量的 `--check-usage` 通过**；两类存储的账号额度与历史占用已核实，但候选未来峰值存量及 GB-month 未验证，完整 `--check-forecast` 返回 1。同团队另一项目的历史消耗已直接读取，未来变化仍是条件假设；`--check-account` 同样返回 1。候选生产 CPU/内存、Sentry 上传和部署后账单也仍缺证据，不能声明所有 Hobby 额度已满足。最终前后数值及边界由[预算文档](../plans/2026-10-03-vercel-hobby-budget.md)维护。

## 静态检查与已知边界

- Web 与 Storybook 类型检查通过；复用的公开缓存/学校逻辑测试 14/14 通过。
- 3 份 Storybook 场景共 30/30 通过。Next 图片 quality/LCP 的 Storybook 警告保留，未伪造生产错误或吞掉断言。
- API 类型检查、定向 ESLint 通过，已有 4 套 API 测试 25/25 通过；新迁移在 disposable 数据库真实应用。
- Web lint 0 errors；5 条既有警告来自生成的 MSW 和原有跳转写法。
- 独立 CDN 打包器与发布回执的 10 项 CLI 黑盒验收通过，覆盖 active/退休保留、归档回滚重新发布后长期保留、幂等、文件完整性、拒绝 source map、CORS、超预算与不合法目录。最终只读审查发现回滚时需重新确认 active，已补全发布指南，并通过 A→B→A→后续候选的实际 CLI 调用验证 31 天后仍保留在线 A。可运行 `node scripts/cdn/verify-bundle.mjs` 重建工件。
- 测算器的 17 项 CLI 合同行为可由 `node scripts/usage/verify-budget.mjs` 重建；覆盖新增构建/存储边界、部分已知的团队存储超额不得被未知值掩盖，以及账号未通过时的明确阻断原因。未知账号值不按零计算。

随后通过 Codex in-app browser 的现有登录态取得 Dashboard 最近 30 天的团队总量与两个项目的拆分，脱敏工件为 `artifacts/usage/vercel-dashboard-current.json`、`vercel-dashboard-all-projects.txt`、`vercel-dashboard-lilink.txt` 与 `vercel-dashboard-other-project.txt`。CLI 成本接口返回 404、指标接口要求 Observability Plus 的限制仍成立，但不再阻断历史 Usage 的只读查看。仪表盘显示值有舍入，当前历史值不能替代未发布候选的未来用量，详见[预算与账户证据](../plans/2026-10-03-vercel-hobby-budget.md)。此次无账号升级、生产迁移、上传、域名或环境变量修改，无远端 CI 运行结论。生产发布前仍须按[静态 CDN 指南](../guides/static-cdn.md)先上传配套资源再切换页面，并配置 API/Web 通知密钥。

性能补测另外发现哈希背景原图迁到 CDN 后只有 1 小时缓存，未保持原有一年 `immutable` 契约。修复后扩展的 CLI 黑盒验收为 **13/13 通过**，工件 `artifacts/static-cdn-verification/hashed-originals-report.json`，覆盖内容指纹验真、同 URL 冲突、在线与退休原图保留、互不重叠的 Pages 缓存规则，以及规则数保留 20% 余量。正式性能矩阵对应修复前已冻结的缓存头；缓存头修复的实际 WebKit 复验单独记录于[性能验收](2026-10-03-public-performance.md)，不回写或合并旧样本。
