---
kind: adr
lang: zh
---

# 首页快照与业务驱动失效

> 文档归属：[设计决策](README.md)。日期：2026-10-03；2026-10-04 按 Vercel 现有拓扑收敛。状态：本地实现，发布待授权与生产验收。

## 背景与目标

首页此前组合 60 秒 landing 与 30 秒 community 的 Next Data Cache，实际整页 ISR 最短周期是 30 秒。浏览器又通过 Vercel 同源接口每 30 秒获取社区数据。人数展示、SEO 首屏和整页重生耦合，频繁写入带来 Hobby 额度压力。去掉不展示的 generatedAt 能减少一种变化，却不能在保留 Sentry 追踪时保证整页字节不变。

目标明确为继续使用 Vercel 托管前端、图片、JS、CSS 和字体；不迁移 Cloudflare Pages，不拆独立静态 CDN。按 50,000 PV/月规划，重点将 ISR Writes 控制在 Hobby 免费额度的 80% 内，即当前规划的 160,000 写入单位/月；其他用量继续核算并报告风险。缓存 TTL 变长不能单独证明达标，容量模型和生产用量均需验收，见[用量预算](../plans/2026-10-03-vercel-hobby-budget.md)。

首页统计允许约 30 分钟的服务端更新窗口，不要求后台变化立即通知已经打开的页面。保留 API → Vercel 按需通知，不引入 SSE 或浏览器实时推送；中国大陆首屏、图片、点击导航和关键业务路径应与当前生产版本对照，不能用 localhost 或构建成功代替。

## 选择与职责

- API 拥有业务数据、统计口径、事务、失效队列和持久化领取状态。Web 拥有公开字段校验、首屏缓存和展示，不直接读取数据库。
- Web 首页与唯一 `/public/home` Data Cache 使用 3600 秒 TTL 兜底、`public-home` tag。服务端快照共同提供平台统计、社区图表、揭晓时间和底部提示；浏览器不轮询、不在恢复可见时刷新。倒计时只依据已知揭晓时间本地计时。
- PostgreSQL 延迟约束 trigger 在提交阶段比较公开投影相关字段，在原业务事务中只更新 `home` / `schools` 两个有限 scope 的持久行，不发送 HTTP。回滚不会留下通知，进程崩溃不会丢掉已提交待办。
- Dispatcher 在事务提交后工作，启动恢复 pending，并每 1 分钟补扫。普通变化合并 30 分钟，首次 urgent 可等待 5 秒；每 scope 的所有后续失效领取共同受 30 分钟门限约束，urgent 也不绕过。发送尝试另有至少 60 秒间隔。发送前清理本进程公开读缓存，计算稳定投影 hash，内容等价时只确认 revision。
- Web 验证时间戳 HMAC，只允许固定 scope，再通过同样的共享密钥调用 API `/v1/internal/public-cache/claim`。API 用数据库原子领取 claimedRevision/lastClaimedAt；同或旧 revision 返回 duplicate，新 revision 受门限时 deferred。Web 将其分别映射为 200 `invalidated: false` 和 429 + `Retry-After`，获准后才执行 `revalidateTag(tag, 'max')`。
- 有效门限延后不消耗 dispatcher 故障尝试次数。网络/服务故障仍使用 CAS lease 和有界重试；并发新增 revision 不被旧确认吞掉。领取去重跨 Vercel 实例持久化，减少重试和重复通知带来的失效。

## 权衡与边界

数据库 trigger 增加了可观察的数据库逻辑，能覆盖后台、定时任务、批量写入及未来新增写入入口。只有公开投影相关字段改变才排队；dispatcher 的投影 hash 再过滤不会改变展示的事件。新增统计口径时必须同步迁移函数和相关验收。

两行 outbox 会成为同类批量写入的短时串行点。每次事务只做小行 upsert，不做网络操作；业务行锁全部取得后，延迟约束 trigger 才统一按 home → schools 顺序取队列锁，避免注销和揭晓路径出现业务行与队列行的锁序环。大批导入仍需监控业务事务延迟。每分钟补扫增加少量数据库读取，用于覆盖业务入口未主动唤醒及重启恢复；扫描自身不产生 ISR 失效。

API 多实例各有内存缓存，仅清理发送实例不等于广播所有实例；当前部署应保持单实例，扩容前增加跨实例缓存版本同步。约 30 分钟是合并和领取间隔，仍受读取、后台刷新及故障影响，不是统计最大延迟承诺。

领取必须先于外部 tag 失效落库。Web 在领取成功后、失效前崩溃时，可能漏掉该次失效，重试不再次领取；明确不保证 exactly-once。保留小时 TTL 作为后续访问的恢复机会，持续故障下不承诺固定时间内变新。采用 `revalidateTag(tag, 'max')` 保留旧值并后台刷新，不让接收通知立即删除可读页面。

移除同源 `/api/public/community` 旧内部路径和首页浏览器快照 provider，避免留下平行刷新链路。已有公开 API `/public/community` 与 `/public/landing` 保留外部契约。学校静态合作介绍不随管理端学校记录自动改写；`schools` 失效作用于注册资格目录接口。

公开导航、页脚及大部分首页 CTA 停止自动路由预取；首页“了解更多”保留 `/about` 预取，预取请求及静态流量纳入预算。图片保留带内容 hash 的压缩 WebP 和旧路径 308 兼容，全部由 Vercel 提供。Web Analytics 采样 50%，Speed Insights 采样 1%；采样后台数据不代表原始完整 PV。Sentry 配置保持原样。[原性能验证](../validation/2026-10-03-public-performance.md)记录先前候选的观察，不能替代当前 Vercel 拓扑和中国大陆生产对照。

## 发布与回滚

发布顺序为先应用 `20261003090000_public_cache_invalidation` 和 `20261004100000_public_cache_delivery_claims` 两条迁移，部署同时提供 `/v1/public/home` 与 `/v1/internal/public-cache/claim` 的 API，只配置共享密钥并保持发送 URL 为空；再部署带相同密钥的 Web；最后通过受保护配置渠道配置 API 发送 URL，开启 dispatcher。新 Web 不能搭配缺少 claim 端点的旧 API，也不能只应用第一条迁移。Web 构建需要 API 可读，失败不伪造空统计快照。

API/Web 共用不少于 32 字符的 `PUBLIC_CACHE_REVALIDATION_SECRET`；API 允许 secret-only 配置，`PUBLIC_CACHE_REVALIDATION_URL` 为空时不会发送通知，URL 非空时必须已有有效密钥。不得进入 Git 或 NEXT_PUBLIC 变量。该顺序不需要新增启用变量或修改全局后台任务开关；开启发送 URL 必须在 API/数据库及 Web 接收端就绪后，避免发布窗口耗尽重试。部署与真实环境配置需要用户授权，此次本地改进不构成发布授权。

回滚先关闭发送端，再回滚 Web，最后按需要回滚 API；保留新增表、领取字段和 trigger，避免破坏性逆向迁移。关闭通知时保留小时 TTL；旧版 Web 如仍采用 30 秒策略会恢复旧用量。耗尽任务、领取去重及恢复边界见[现行缓存契约](../reference/public-data-cache.md)。
