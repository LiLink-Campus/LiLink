---
kind: readme
lang: zh
---

# 验收记录

> 文档归属：[项目文档](../README.md)。

## 职责与效力

历史记录中的本机工件路径仅供原验收机器定位，文件保留在 Git 忽略目录，不作为仓库交付或公开下载链接。后续验证应重跑相应用户路径并保存新证据；公开 Markdown 链接必须指向随 Git 交付的文件或可访问的外部来源。

保存可复现的业务验收命令、断言与边界。仅对应记录中的环境、提交和数据前提，不能替代今天的验收。

## 目录

- [展示投影、实际发布核验与 Sentry 缓存稳定性验收](2026-10-04-stable-isr-publication.md)。

- [Vercel 静态资源、学校图集与背景融合验收](2026-10-04-vercel-resource-optimization.md)。
- [保留 Vercel 的 ISR 控制与验收](2026-10-04-vercel-only-isr.md)。
- [On-demand Revalidation 的 ISR Writes 专项验收](2026-10-04-isr-write-budget.md)。
- [全站位图 WebP 压缩与用量复测](2026-10-04-webp-images.md)。
- [公开页面性能对照](2026-10-03-public-performance.md)。
- [大陆直连公开页面性能补测](2026-10-03-mainland-direct-performance.md)。
- [Vercel 快照、失效与独立 CDN 本地验收](2026-10-03-vercel-cache-cdn.md)。

- [文档自动检查与原型隔离修复](2026-10-01-documentation-review-fixes.md)。
- [暂存文档门禁与分类导航修复](2026-10-01-staged-docs-navigation.md)。
- [未提交文档重整的独立审查与修复](2026-10-01-uncommitted-review.md)。

| 文档 | 用途 |
| --- | --- |
| [人工匹配手机号登记](2026-09-14-match-leads.md) | 历史快照 |
| [1 对 1 恋爱匹配活动页](2026-09-14-one-to-one-page.md) | 历史快照 |
| [协议与隐私页面改版](2026-09-15-legal-pages.md) | 历史快照 |
| [学校邮箱 .cn 后缀支持](2026-09-15-school-cn-aliases.md) | 历史快照 |
| [轮次列表常驻与统一编辑](2026-09-16-admin-cycles-flat.md) | 历史快照 |
| [轮次中心：图表、预演与审计整合](2026-09-16-admin-cycles-workbench.md) | 历史快照 |
| [2026-09-16 后台视觉重构](2026-09-16-admin-redesign.md) | 历史快照 |
| [用户详情状态与操作区分](2026-09-16-admin-user-status.md) | 历史快照 |
| [常态邀请推广与商户活动拆分](2026-09-16-independent-promotion.md) | 历史快照 |
| [注册容量限制移除验收](2026-09-16-registration-capacity-removal.md) | 历史快照 |
| [生活习惯与 VIP 高级筛选验收](2026-09-17-profile-lifestyle-vip.md) | 历史快照 |
| [本地学校名单与邮箱后缀统一](2026-09-17-school-directory-sync.md) | 历史快照 |
| [用户中心重启验收](2026-09-17-user-center.md) | 历史快照 |
| [VIP 页面视觉改版](2026-09-18-vip-redesign.md) | 历史快照 |
| [分支深度审查与冗余清理](2026-09-19-branch-review-cleanup.md) | 历史快照 |
| [联系方式公开权限修复与验收](2026-09-19-contact-disclosure-fix.md) | 历史快照 |
| [分支审查问题修复](2026-09-19-review-fixes.md) | 历史快照 |
| [生产前分支审查修复验收](2026-09-20-branch-review-fixes.md) | 历史快照 |
| [浏览器 E2E 基础设施验收](2026-09-20-browser-e2e.md) | 历史快照 |
| [2026-09-20 发布前依赖安全复核](2026-09-20-dependency-security-review.md) | 历史快照 |
| [2026-09-20 迭代审查与修复](2026-09-20-iterative-review-fixes.md) | 历史快照 |
| [2026-09-20 Review 修复验证](2026-09-20-review-fixes.md) | 历史快照 |
| [优惠券概览并发一致性验收（2026-09-26）](2026-09-26-coupon-overview-consistency.md) | 历史快照 |
| [资料页与账户模块职责拆分](2026-09-26-deep-cleanup.md) | 历史快照 |
| [Loading and read-path performance validation](2026-09-26-loading-performance.md) | 历史快照 |
| [PR 134 / 135 integration validation](2026-09-26-pr-integration.md) | 历史快照 |
| [冗余测试与内部兼容代码清理](2026-09-26-redundant-code-cleanup.md) | 历史快照 |
| [Storybook bootstrap coverage follow-up](2026-09-26-storybook-bootstrap-coverage.md) | 历史快照 |

## 模板与命名

本目录子文档采用 `kind: changelog`，并回溯本入口。命名与通用格式遵循 [统一维护规范](../guides/documentation.md)；具体内容围绕本目录职责组织。
