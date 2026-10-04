---
kind: changelog
lang: zh
---

# 展示投影、实际发布核验与 Sentry 缓存稳定性验收

> 文档归属：[验收记录](README.md)。日期：2026-10-04。现行契约见[公开缓存](../reference/public-data-cache.md)，设计见[内容核验决策](../decisions/2026-10-04-content-addressed-public-cache.md)。

## 环境与数据前提

本轮在 macOS、Node 24.20.0、npm 11、Docker 29.5.2、Next.js 16.3.5 与 Playwright 1.60.0 下运行。所有业务写入限于 runner 创建的 disposable loopback PostgreSQL/Mailpit，使用合成用户、学校、轮次及商户；临时密钥和 Sentry DSN 由 runner 生成。工件不包含生产凭据或真实用户数据。

源码基线为发布前生产 API/Web 的 `e5a6e99e86f6b0942fd1800b4caf39f27d1071e9`。候选为本轮冻结工作树；性能 Web 源码摘要为 `b1fe483c761c9737ffd1384ad40c380abaaef0470a1a0b5cb42246de126d2319`。本记录随最终实现提交交付；远端 CI、部署 SHA 和生产只读结果另保存在本机发布工件中，不能从本记录推定已部署。

## 行为命令与结果

```sh
node scripts/e2e/run.mjs public-home-projection.spec.ts public-cache-publication.spec.ts home-cache-stability.spec.ts isr-write-budget.spec.ts --grep @smoke
node scripts/e2e/run.mjs sentry-cache-tracing.spec.ts isr-write-budget.spec.ts --grep '@sentry|@smoke' --sentry-tracing
```

第一组 runner `869939e8b188`：40/40 通过。第二组 `ab413601464e`：16/16 通过。两组均使用 Desktop Chromium、移动 Chromium、Desktop WebKit 和移动 WebKit，分别为 1280×800、Pixel 7、1280×800 和 iPhone 13 的隔离引擎配置；不能等同真机 iPhone 或用户已安装的 Safari。

| 业务断言 | 可观察证据 |
| --- | --- |
| 轮次代号、报名截止变化不改变首页展示 | 管理端真实修改后，外部 API 保留新字段；首页文字、日期、HTML/RSC 与接收领取次数保持 |
| 等值学校排序稳定 | 反向插入同名同人数的合成学校，资格目录及首页按 id 决胜 |
| 显示字段变化能够发布 | 管理端修改揭晓时间，持久 dispatcher 使真实页面及底部提示收敛 |
| 通知确认不能冒充发布成功 | 合成持久状态复现领取成功但失效丢失；核验检测实际旧页，保留三十分钟门限，再通过真实通知修复可见日期 |
| 故障预算跨过期 ownership 保留 | 停止 runner 自有 Web 进程组，六次真实 HTTP 超时消费六次尝试；过期 lease 不能领取第七次；恢复后浏览器页面可用 |
| 相同内容真实重生保持字节稳定 | 获准合法新 revision 后读取真实缓存新版本，四引擎 HTML/RSC 全字节相同；不剔除追踪字段再比对 |
| 公开缓存与动态请求追踪分路 | 公开页无 trace metadata；两次访问为不同根 trace；动态 SSR 本次 trace 与浏览器 parent span 对应 |
| 错误及 Replay 继续工作 | 每个引擎必须收到本次新增的合成错误和 Replay，不借用历史 collector 事件；共四次独立错误与四次新 Replay |

工件位于本机 `artifacts/e2e/<run-id>/`，包含 `results.json`、HTML 报告、断言附件和必要截图；首次失败保留 trace/video，用于修复 Content-Type、DOM innerText 读取方式、合成 collector CORS 与新 Replay 事件边界。Web 停止恢复可能出现旧 keep-alive socket 的短暂 reset，验收在十秒有界恢复窗口中记录其次数，未忽略最终可见状态或失败预算。

## 辅助检查与审核

共享包原有 110 项测试、API public/community 原有九项行为测试和 Web 缓存原有六项测试通过。API/Web 类型检查、root lint、隔离 runner 两项环境检查、脚本语法、Git diff 检查及 API production Dockerfile 构建通过；本机 Docker 构建不上传 source maps，生产构建仍必须上传。多 Agent 独立反复审核并修复 ABA 等价判断、过期 lease 确认、回执协议、有界核验预算、故障附件误报及发布脚本外部漂移保护。

Codex 应用内浏览器检查首页及学校目录的桌面 1280×800、移动 390×844，首页文字换行、图表、学校目录及真实移动菜单导航可读且无横向溢出；截图保存在本机 `artifacts/isr-stable-release-20261004/iab/`。完整浏览器业务回归、Storybook 和精确提交 CI 使用仓库现有 GitHub Actions；应单独读取最终提交的结果。

文档稳定检查无诊断。preview 的一条 EVD001 位于历史性能记录 `2026-10-03-public-performance.md` 第 108 行，经人工核对不属于本轮新增契约。

## 性能与生产证据边界

性能对照采用同一合成 API、两份生产模式 Web、十个配对轮次、桌面及移动、150 ms/10 Mbps/2 Mbps/4× CPU 压力配置，测量首页与学校页冷暖加载，以及首页到关于/注册入口的真实点击。两侧 DSN 均关闭；Sentry 行为由独立采集验收。原始采样及可重生成汇总位于 `artifacts/performance/isr-stability-20261004/`，最终结论须读取完整原始数据，不因前几轮无失败而提前判定。

本机压缩输出：HTML 63,975 bytes / gzip 14,608；RSC 29,173 / gzip 7,653。删除必要 SVG 或框架序列化会影响视觉或 hydration；未发现满足不增加请求、脚本和性能负担的高价值缩减项，因此本轮保留组件结构。这些文件大小和本地新版本写入不能换算为 Vercel 精确 ISR 计费。

生产拓扑、静态资源来源、已有密钥及后台开关沿用。小时 TTL 保留独立恢复机会；随机 metadata 被移出缓存后，同内容重生的相同输出才是减少 ISR Writes 的依据。生产只读验收只能证明所访问边缘及当前用户路径；全球收敛、真实大陆性能、完整账期 ISR Writes 降幅及数据库完整恢复演练均需各自证据。
