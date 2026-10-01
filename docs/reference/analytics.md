---
kind: reference
lang: zh
canonical: true
---

# 运营统计与退役产品事件

> 文档归属：[现行参考](README.md)。

统计基于业务数据，由 [AdminAnalyticsModule](../../apps/api/src/modules/admin-analytics/admin-analytics.module.ts) 管理；用户、报名、轮次与匹配口径查询对应 service。正常账号不等于 DAU，累计问卷或报名数不等于当前可匹配人数。

## 公开统计口径

| 指标 | 当前定义 |
| --- | --- |
| 首页 registeredUsers、社区 total | ACTIVE、未注销且 `isTest=false` 的账号数 |
| 首页 completedQuestionnaires | 上述账号中，现存答案或答案归档已提交且存在可识别性别的账号数；不是当前问卷完整率 |
| 首页 matchesDelivered | 同时有 revealedAt 与 introducedAt，存在参与者且所有参与者仍为 ACTIVE、未注销、非测试账号的 Match 数；一对计一次 |
| 社区 genders、schools | 同一有效账号群体按性别、当前学校聚合；无可识别性别或学校时落入未知分类，符合资格的学校可以显示零人数 |

性别优先读取 QuestionnaireResponse 的已提交答案，缺失时回退最近可用的已提交归档；这是累计统计补足，不使旧问卷进入本轮匹配池。冻结和注销可使公开人数下降，匹配数也不是 SMTP 成功或收件箱到达计数。实现由 [PublicService](../../apps/api/src/modules/public/public.service.ts)、[CommunityStatsService](../../apps/api/src/modules/public/community-stats.service.ts) 与 [性别读取规则](../../apps/api/src/common/analytics/public-questionnaire-gender.ts) 定义。

后台统计默认排除测试账号，但支持显式 `includeTest=true`；不能把后台查询与公开统计当作同一口径。匹配池始终排除测试账号，完整报名/问卷资格按 [匹配规则](matching.md) 判断。查看 [缓存策略](public-data-cache.md) 后再解释数据刷新；历史运行快照不能证明当前人数。

## 事件边界

[AppModule](../../apps/api/src/app.module.ts) 不再启用旧采集模块；ProductEvent/ProductEventOutbox 历史表保留在 [schema](../../apps/api/prisma/schema.prisma)，表存在不证明采集、消费或漏斗启用。

[RetiredProductEventsService](../../apps/api/src/modules/retired-product-events/retired-product-events.service.ts) 保留事件保留期清理。ReferralEvent、券、核销、邮件 outbox 和 AuditLog 分别支撑业务及审计，不能用点击代替。

前端监控与统计组件查询 [root layout](../../apps/web/src/app/layout.tsx) 和配置。本仓库尚无 PostHog SDK 接入；后续方案须重新确认事件、去重、身份和隐私边界。旧盘点见 [归档入口](../archive/README.md)。
