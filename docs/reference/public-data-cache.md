---
kind: reference
lang: zh
canonical: true
---

> 文档归属：[现行参考](README.md)。

# 公开页面缓存策略

前端和全部静态资源继续由 Vercel 托管。首页展示服务端最近成功的公开快照，业务事件通过 API → Vercel 的持久化通知按需失效；已经打开的页面不轮询、不订阅 SSE，也不在恢复可见时请求新统计。设计理由、发布兼容性与回滚见[设计决策](../decisions/2026-10-03-public-home-snapshot.md)；容量假设与核算见[Hobby 预算](../plans/2026-10-03-vercel-hobby-budget.md)。

首页静态首屏、步骤、FAQ 和加入按钮不等待公开数据或客户端初始化。只有统计区与底部揭晓文案位于局部 Suspense，两个区域共享同一次服务端快照读取；fingerprint 随统计区输出，仍标识完整公开数据投影。统计区加载态预留一个视口高度，避免流式数据释放前页面暂时缩短，使屏外插画提前触发原生懒加载。图片预览来自构建期页面 CSS，高清图由原生响应式图片加载；这些呈现边界不改变缓存键、TTL、通知频率或 API 读取路径。

## 读取与展示

| 内容 | 缓存与刷新 |
| --- | --- |
| 首页 HTML/RSC、`/public/home` Data Cache | 3600 秒兜底，tag `public-home`；获准的业务通知以 `revalidateTag(tag, 'max')` 标记过期，保留旧值并后台刷新 |
| 打开的首页 | 使用服务端快照，不追加浏览器统计请求；揭晓倒计时只依据已知时间在本地计时 |
| 注册学校及邮箱后缀 | 同源 `/api/public/schools`；Data Cache、浏览器/Vercel 缓存 60 秒，tag `public-schools` |
| 更新日志 | 沿用 1 小时缓存 |
| 登录状态、问卷答案、报名、VIP/支付、匹配结果、后台管理 | 原有私有/no-store 读取与写后刷新 |
| JS/CSS、字体、图片和图标 | 留在 Vercel；固定公开图片使用构建期响应式资源与同源 `public`，其余图片沿用 Next Image，无独立静态 CDN |

`HomeSnapshotSections` 与底部轮次提示直接消费服务端传入的 landing/community。页面再次加载时获取当时可用的快照；按需失效采用 stale-while-revalidate，因此首次访问仍可能看到旧值，随后读取才收敛。不承诺后台变更立即出现在已经打开的页面。

服务端只缓存 allowlist 中的 `/public/home`、`/public/schools`，不转发 Cookie、认证头或用户标识。API origin 和 path 参与缓存键；上游连接与响应体合计每次限时 4 秒，网络错误/5xx 最多重试一次，429 不立即重试。共享 `normalizePublicHomeSnapshot` 校验首页展示投影，只保留统计、社区人数及揭晓时间；品牌、标语、轮次代号、报名截止时间和生成时间不参与首页内容身份。原有公开 API 保留外部字段。Web 使用 `public-data-v3` 缓存键，避免复用旧投影。

服务端读取失败会抛错，不能将失败转换成成功的空统计页覆盖旧快照。首次构建需要可用 API。已有快照过期后继续使用 stale-while-revalidate；持续故障下可能显示更旧的数据。3600 秒 TTL 只提供后续访问时的恢复机会，不是最大端到端延迟承诺，也不保证定时主动重生。API 成功响应带 `public,max-age=60`，故障返回 503/no-store。

公开缓存 HTML 不包含随机 `sentry-trace`、`baggage`；浏览器每次访问独立开始 pageload trace，服务端生成仍记录自己的 trace。已有动态 SSR 路由显式输出本次请求的追踪元数据；根布局不读取请求状态，以免公开页变成动态 SSR。错误、Replay、source maps 和浏览器/API 追踪保持启用，不固定或复用 trace ID。设计见[展示内容核验与稳定追踪](../decisions/2026-10-04-content-addressed-public-cache.md)。相同业务投影还须验证实际 HTML/RSC 字节。Data Cache JSON 与整页 ISR 是不同层，验收分别记录，不能将本地缓存文件写入直接当成线上写入账单；最终效果以生产 Vercel ISR Writes 确认。

## 业务变更与发送

`PublicCacheInvalidation` 只有 `home`、`schools` 两个 scope。第一条迁移中的延迟约束 trigger 在提交阶段比较公开投影相关字段，取得业务行锁之后才更新队列，避免注销与轮次揭晓形成锁序环；原事务回滚时队列更新一同回滚。注册/注销/冻结、学校归属、已提交性别、问卷归档、已揭晓且已介绍的匹配、轮次及学校目录变更均覆盖；登录、普通资料名字和无关 updatedAt 不排队。第二条迁移将普通变化合并窗口改为 30 分钟，并增加持久化领取字段 `claimedRevision`、`lastClaimedAt`。连续变化不会无限延后首次 dueAt。

Dispatcher 启动恢复待办，已有业务提交后主动唤醒；每 1 分钟补扫未唤醒的变更。普通变化首次等待 30 分钟；轮次/学校等 urgent 首次可在 5 秒后尝试，但该 scope 已领取过失效后，所有后续变化共同受 30 分钟门限约束，urgent 也不绕过。发送尝试还至少间隔 60 秒。扫描和通知请求不等于页面重生。

worker 清理本进程 landing/community/学校缓存，读取稳定公开投影。学校 hash 去掉生成时间；首页 hash 使用共享展示投影。首页 hash 与已通知 hash 相同时，还须即时读取实际首页 fingerprint 相同才能只确认 revision，历史核验记录不能单独作为等价证明。revision + CAS lease 防止两个 worker 同时处理；发送中新增 revision 不能被旧确认吞掉。HTTP 超时 5 秒、最多 6 次故障尝试，等待 60/120/240/480/900 秒；耗尽后记录 exhaustedAt，停止自动尝试。重启恢复 pending，不重置耗尽项；最后一次领取后失联的 worker 在租约过期后也会持久化耗尽状态，不能领取第 7 次；新的相关业务变化可重新激活。人工重置必须按运维授权执行并先修复失败原因。诊断仅记录 scope、revision、attempt、是否耗尽，不打印秘密与用户数据。

## 接收、持久化领取与重复控制

API 用 `PUBLIC_CACHE_REVALIDATION_URL` 通知 Web `/api/internal/public-cache/revalidate`，两端共用不少于 32 字符的 `PUBLIC_CACHE_REVALIDATION_SECRET`。API 的 URL 非空时必须配置有效密钥；允许先仅配置密钥、保持 URL 为空，此时领取端可用而 dispatcher 禁用，保留小时 TTL。分阶段发布先上线含两条迁移与 claim 端点的 secret-only API，再上线带相同密钥的 Web，最后配置 API URL 开启发送；不需新增启用变量或修改全局后台任务开关。生产要求 HTTPS，URL 不携带凭据、query 或 fragment。Web 未配置有效共享密钥时返回 503。

Web 验证 `HMAC-SHA256(secret, timestamp + '.' + rawBody)`：时间戳头 `x-lilink-timestamp`、十六进制签名头 `x-lilink-signature`；正文仅 `{scope,revision}`，最多 1024 bytes，读取正文最多 3 秒，时间容差 ±300 秒，revision 为正 bigint 整数字符串。scope 只能映射到固定 tag，不接受任意 path/tag。

验证通过后，Web 将正文规范化为 `JSON.stringify({scope,revision})`，重新签名调用 API `/v1/internal/public-cache/claim`。API 原子更新持久化行：新 revision 且该 scope 距上次领取至少 30 分钟，才同时写入 claimedRevision/lastClaimedAt 并授予失效；允许范围仍限于当前已提交的 revision。领取状态不依赖 Vercel 进程内存，适用于多个接收实例。

| 领取结果 | Web 响应与动作 |
| --- | --- |
| 获准新 revision | 200，`invalidated: true`；执行该 scope 的 `revalidateTag(tag, 'max')` |
| 同 revision 或旧 revision 已领取 | 200，`invalidated: false`；不再执行失效 |
| 新 revision 尚在该 scope 的 30 分钟窗口 | 429，`invalidated: false`，附 1–1800 秒 `Retry-After`；不执行失效 |
| API 领取调用失败或响应非法 | 503；不执行失效 |

响应均 `no-store`。Dispatcher 按有效 `Retry-After` 延后 pending，释放 lease 并减回本次 attempts，不将正常门限延后消耗为故障重试。200 还须在原五秒期限内通过最多 1024 bytes 的 JSON 回执校验，仅接受 `{ok:true,invalidated:boolean}`；同/旧 revision 的合法回执可确认该次发送，避免响应丢失后的重复失效。确认、退款与失败写入均要求当前 token 的 lease 仍有效，过期 worker 不能更新发送状态。

领取在 tag 失效之前持久化。如果 Web 在领取成功后、执行失效前崩溃，重试将得到 duplicate，可能漏掉这一次按需失效。这里选择约束重复写入，明确不承诺 exactly-once；小时 TTL 仅提供之后成功读取时的恢复机会，不能掩盖持续上游故障。接收成功日志或 200 也不能单独证明已产生新页面。

`schools` tag 管理注册资格目录，不改写 `/schools` 的静态合作学校介绍。资格展示可能暂时旧，注册提交仍由 API 实时验证。API 的 landing、可注册学校目录和问卷结构缓存仍为 30 分钟，community 为 10 秒；worker 清缓存只影响所在实例，多 API 实例上线前必须补跨实例版本同步。统计口径见[运营统计](analytics.md)。

## 实际页面发布核验

第三条 additive migration 保存 `verifiedHash`、核验时间、预期内容 hash、六次尝试预算及持久 lease。API 现有调度每分钟运行，核验领取间隔至少五分钟；目标首页从已校验通知 URL 推导，禁止跟随重定向。HTTP 限时五秒、完整 HTML 限 256 KiB，只接受唯一 `v1` fingerprint；旧 Web 无标识返回 unsupported，不当作等价发布，也不触发修复风暴。页面 fingerprint 随缓存 HTML 发布，不增加浏览器请求。

空闲核验使用最近已通知的 `deliveredHash`，首次没有预期内容时才读取公开源，避免重复统计聚合。有效 lease 与 revision、ack、预期 hash 的 CAS 防止旧核验覆盖并发状态。不一致且不存在业务 pending、接收门限已打开、通知未耗尽时，增加修复 revision 走原发送链路；修复不绕过三十分钟门限。领取先消耗尝试，同一预期内容最多六次失败或有效修复；正常门限延后不消耗故障预算，修复 revision 不重置预算，新的已通知内容或实际核验成功才恢复。熔断仍保留小时 TTL。

受 HMAC 保护的 `POST /v1/internal/public-cache/verify` 只接受 `{scope:"home"}`，签名规则与 claim 相同；它遵循同一持久领取间隔，不接受 URL、任意标签或强制绕过参数。返回脱敏 outcome 与 no-store。单次核验只证明所访问边缘的内容，不证明全球同时收敛。

## 验证入口

- `node scripts/e2e/run.mjs community.spec.ts home-cache-stability.spec.ts isr-write-budget.spec.ts public-home-projection.spec.ts public-cache-publication.spec.ts sentry-cache-tracing.spec.ts vercel-assets.spec.ts pwa.spec.ts pwa-origin-failure.spec.ts --sentry-tracing --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit`
- `npm run test:storybook:web -- --run apps/web/src/app/community-stats.stories.tsx apps/web/src/stories/public-pages.stories.tsx`

需要 Node 24、npm 11、Docker、已安装依赖和 Playwright 浏览器。runner 使用 disposable PostgreSQL/Mailpit、合成账号、临时签名密钥与同源 loopback 服务。验收覆盖服务端首屏统计、停留与隐藏恢复不追加浏览器统计请求、故障保留与恢复、旧 30 秒窗口之后首页仍 HIT、管理员轮次修改后真实通知使重载页面及底部收敛、拒绝非法通知、事务回滚和合并、重复领取与门限、同源静态资源及 PWA 故障边界。

工件保存于 `artifacts/e2e/<run-id>/`。本地行为结果和预算模型不等于生产账单；生产 ISR 用量与中国大陆当前生产版本性能对照均需独立证据。维护位置：[公开缓存](../../apps/web/src/lib/public-data-cache.ts)、[快照展示](../../apps/web/src/app/home-snapshot-sections.tsx)、[失效接收端](../../apps/web/src/app/api/internal/public-cache/revalidate/route.ts)、[领取端](../../apps/api/src/modules/public/public-cache-claim.controller.ts)、[持久化发送端](../../apps/api/src/modules/public/public-cache-invalidation.service.ts)。
