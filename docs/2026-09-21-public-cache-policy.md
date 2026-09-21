# 公开页面缓存策略

首页人数图表在服务端 HTML 中带上最近成功的公开统计，客户端每 30 秒刷新一次；页面隐藏时暂停，重新可见时立即刷新。单次浏览器请求最多等 10 秒。刷新失败时保留已显示的数据并静默重试；没有成功数据时暂不展示这块可选图表，获取成功后再显示，不展示错误、无限加载提示或虚构的零人数。

| 内容 | 缓存与刷新 |
| --- | --- |
| 人数、性别和学校人数 | Next Data Cache 30 秒；浏览器/CDN 30 秒，允许后台刷新 |
| 首页注册人数、累计问卷、匹配数、轮次汇总 | Next Data Cache 60 秒；首页仍使用 ISR |
| 注册学校及邮箱后缀 | 同源 `/api/public/schools`；Next Data Cache、浏览器/CDN 60 秒 |
| `/images/*` 原图 | 浏览器/CDN 1 小时，允许后台刷新 |
| 更新日志 | 沿用 1 小时缓存 |
| 静态介绍页面、带内容哈希的 JS/CSS、Next 优化图片 | 沿用框架的静态/CDN 缓存 |
| 登录状态、问卷答案、报名、VIP/支付、匹配结果、后台管理 | 保留原有私有/no-store 读取和写后刷新 |

公开缓存只允许 `/public/community`、`/public/landing`、`/public/schools`，不转发 Cookie、认证头或用户标识。API 地址与端点参与缓存键。刷新失败会抛出错误，使 Next 保留最近成功值；冷缓存失败返回 503 和 `Retry-After: 30`，错误响应不缓存。上游读取连接及响应体限时 4 秒，网络错误/5xx 最多重试一次，429 不立即重试。

错误仍记录在服务端，包括连接/响应阶段、上游 HTTP 状态、尝试次数、总耗时、白名单格式的网络错误码和 Cloudflare Ray ID。日志不记录 Cookie、认证头、响应正文或可能携带凭证的原始异常消息。前端隐藏可选统计的失败提示，不把真实接口错误伪装成成功。

缓存周期表示开始重新验证的时间，不是数据最大延迟：多层缓存及后台刷新会叠加延迟；持续故障时可能继续显示较旧的成功统计。学校列表只用于展示与邮箱识别，注册提交仍由 API 校验实时资格。发布替换同路径图片时，已有浏览器缓存可能持续 1 小时；需要立即替换时应使用新文件名。

验证入口：

- `npm run test --workspace web -- src/lib/public-data-cache.test.ts src/lib/eligible-schools.test.ts`
- `npm run test:storybook:web -- --run apps/web/src/app/community-stats.stories.tsx apps/web/src/stories/registration-schools.stories.tsx`
- `node scripts/e2e/run.mjs community.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit`

E2E 只使用 runner 的临时数据库和合成数据。故障恢复用浏览器拦截模拟，验证服务端首屏已有统计、失败保留、30 秒后恢复和注册学校识别，不向生产发验证码。
