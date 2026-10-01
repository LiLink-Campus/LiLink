---
kind: reference
lang: zh
canonical: true
---

> 文档归属：[现行参考](README.md)。

# 公开页面缓存策略

首页人数图表在服务端 HTML 中带上最近成功的公开统计，客户端每 30 秒刷新一次；页面隐藏时暂停，重新可见时立即刷新。单次浏览器请求最多等 10 秒。刷新失败时保留已显示的数据并静默重试；没有成功数据时暂不展示这块可选图表，获取成功后再显示，不展示错误、无限加载提示或虚构的零人数。

| 内容 | 缓存与刷新 |
| --- | --- |
| 人数、性别和学校人数 | Next Data Cache 30 秒；浏览器/CDN 30 秒，允许后台刷新 |
| 首页注册人数、累计问卷、匹配数、轮次汇总 | Next Data Cache 60 秒；首页仍使用 ISR |
| 注册学校及邮箱后缀 | 同源 `/api/public/schools`；Next Data Cache、浏览器/CDN 60 秒 |
| `/images/*` 原图 | 默认浏览器/CDN 1 小时，允许后台刷新；关于页带内容 hash 的 WebP 例外为 1 年 immutable |
| 更新日志 | 沿用 1 小时缓存 |
| 静态介绍页面、带内容哈希的 JS/CSS、Next 优化图片 | 沿用框架的静态/CDN 缓存 |
| 登录状态、问卷答案、报名、VIP/支付、匹配结果、后台管理 | 保留原有私有/no-store 读取和写后刷新 |

公开缓存只允许 `/public/community`、`/public/landing`、`/public/schools`，不转发 Cookie、认证头或用户标识。API 地址与端点参与缓存键。刷新失败会抛出错误，使 Next 保留最近成功值；冷缓存失败返回 503 和 `Retry-After: 30`，错误响应不缓存。上游读取连接及响应体限时 4 秒，网络错误/5xx 最多重试一次，429 不立即重试。

错误仍记录在服务端，包括连接/响应阶段、上游 HTTP 状态、尝试次数、总耗时、白名单格式的网络错误码和 Cloudflare Ray ID。日志不记录 Cookie、认证头、响应正文或可能携带凭证的原始异常消息。前端隐藏可选统计的失败提示，不把真实接口错误伪装成成功。

缓存周期表示开始重新验证的时间，不是数据最大延迟：多层缓存及后台刷新会叠加延迟；持续故障时可能继续显示较旧的成功统计。学校列表只用于展示与邮箱识别，注册提交仍由 API 校验实时资格。发布替换默认策略的同路径图片时，已有浏览器缓存可能持续 1 小时；内容 hash 图片须随内容更新文件名，其缓存可持续 1 年。具体声明见 [Next 配置](../../apps/web/next.config.ts)。

上述是 Web 层策略。API 进程的 landing、可注册学校目录和公开问卷结构缓存 TTL 为 30 分钟，社区统计为 10 秒；学校邮箱解析另有短期缓存。策略与常量由 [PublicService](../../apps/api/src/modules/public/public.service.ts)、[CommunityStatsService](../../apps/api/src/modules/public/community-stats.service.ts) 和 [QuestionnaireService](../../apps/api/src/modules/questionnaire/questionnaire.service.ts) 维护。

写入不会统一清空公开缓存；显式失效范围如下：

| 写入路径 | 失效范围 |
| --- | --- |
| 后台轮次创建/编辑/删除、周轮次设置和手动执行，自动周轮次创建、揭晓/强制重置及账号注销 | landing；见 [CyclesService](../../apps/api/src/modules/cycles/cycles.service.ts)、[WeeklyCycleService](../../apps/api/src/modules/cycles/weekly-cycle.service.ts)、[AccountDeletionService](../../apps/api/src/modules/account/account-deletion.service.ts) |
| 学校管理 | 社区统计（含学校分组）、学校邮箱解析、可注册学校目录及公开问卷结构；见 [AdminSchoolService](../../apps/api/src/modules/admin/admin-school.service.ts) |
| 后台发布问卷 revision | 公开问卷结构；见 [AdminService](../../apps/api/src/modules/admin/admin.service.ts) |

注册、用户问卷提交及后台账号冻结不会主动清除 landing 缓存，它们引起的统计变化依赖 TTL 到期后的读取或后续相关失效。重启清空进程缓存，多实例的缓存状态独立，不能仅根据 Next 的 30/60 秒声明承诺端到端新鲜度。

缓存成功响应可以在上游数据库暂时不可达时继续返回。`/v1/health` 只证明 API 进程应答，landing 返回成功也可能命中缓存；两者均不能单独证明数据库当前可读。指标的账号及归档口径由 [运营统计](analytics.md) 定义。

验证入口：

- `npm run test --workspace web -- src/lib/public-data-cache.test.ts src/lib/eligible-schools.test.ts`
- `npm run test:storybook:web -- --run apps/web/src/app/community-stats.stories.tsx apps/web/src/stories/registration-schools.stories.tsx`
- `node scripts/e2e/run.mjs community.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit`

E2E 只使用 runner 的临时数据库和合成数据。故障恢复用浏览器拦截模拟，验证服务端首屏已有统计、失败保留、30 秒后恢复和注册学校识别，不向生产发验证码。

维护位置：[public-data-cache.ts](../../apps/web/src/lib/public-data-cache.ts)。
