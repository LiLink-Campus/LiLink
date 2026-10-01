---
kind: reference
lang: zh
canonical: true
---

# 运营统计与退役产品事件

> 文档归属：[现行参考](README.md)。

统计基于业务数据，由 [AdminAnalyticsModule](../../apps/api/src/modules/admin-analytics/admin-analytics.module.ts) 管理；用户、报名、轮次与匹配口径查询对应 service。正常账号不等于 DAU，累计问卷或报名数不等于当前可匹配人数。

[AppModule](../../apps/api/src/app.module.ts) 不再启用旧采集模块；ProductEvent/ProductEventOutbox 历史表保留在 [schema](../../apps/api/prisma/schema.prisma)，表存在不证明采集、消费或漏斗启用。

[RetiredProductEventsService](../../apps/api/src/modules/retired-product-events/retired-product-events.service.ts) 保留事件保留期清理。ReferralEvent、券、核销、邮件 outbox 和 AuditLog 分别支撑业务及审计，不能用点击代替。

前端监控与统计组件查询 [root layout](../../apps/web/src/app/layout.tsx) 和配置。本仓库尚无 PostHog SDK 接入；后续方案须重新确认事件、去重、身份和隐私边界。旧盘点见 [归档入口](../archive/README.md)。
