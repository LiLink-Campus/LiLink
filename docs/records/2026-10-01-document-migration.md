---
kind: changelog
lang: zh
---

# 文档重整清单与迁移表

> 文档归属：[实施记录](README.md)。

## 基线与判定边界

清单以本次整理前的本机文件和 Git 历史生成。文件名中的日期、正文的事件日期、首次进入 Git 的日期分别保留，不互相推定；合并提交不自动证明上线。来源提交与完整入链、哈希清单保存在本机验收工件中。

## 实施前识别的失败方式

- 移动文件造成相对路径、标题锚点、命令中的原型路径失效。
- 旧代码已删除，历史文档误链到今天不同语义的模块。
- 将 Git 首次收录日期当成设计发生日期，或将测试通过当成部署完成。
- 重复维护业务规则、环境拓扑和发布步骤，造成事实漂移。
- 原型遗漏素材、共享包路径错误、无法启动或预览请求连接真实数据。
- 私有原件进入公开 Git；配置排除或空检查被误判为规范通过。

## 逐篇去向

历史页面只保存当时事实；现行页面核对当前代码、脚本与配置。旧说明按主题融合，章节去向与不再适用的内容见本页后续记录。入链列采用整理前的文件路径，空表示基线中无 Markdown 链接入链，不代表代码或正文中没有引用。

| 原路径 | 用途 | 效力 | 目标路径 | 类型 | 基线入链 | 处理理由 |
| --- | --- | --- | --- | --- | --- | --- |
| `.github/pull_request_template.md` | pull_request_template | 专项模板或第三方来源说明 | `.github/pull_request_template.md` | `excluded` | 无 | 保持既有模板或来源记录；明确排除通用文档检查，不声明为现行业务规范 |
| `AGENTS.md` | LiLink Agent Rules | 项目规则或来源说明 | `AGENTS.md` | `howto` | `README.md`；`docs/archive/2026-10-01-handover-consolidation.md`；`docs/埋点优化/README.md` | 保留职责边界，更新文档指针 |
| `README.md` | LiLink | 分类导航 | `README.md` | `readme` | `docs/archive/2026-10-01-handover-consolidation.md` | 建立职责边界与唯一维护入口 |
| `apps/api/AGENTS.md` | API Agent Rules | 项目规则或来源说明 | `apps/api/AGENTS.md` | `howto` | 无 | 保留职责边界，更新文档指针 |
| `apps/api/src/vendor/edmonds-blossom/README.md` | Edmonds Blossom | 专项模板或第三方来源说明 | `apps/api/src/vendor/edmonds-blossom/README.md` | `excluded` | 无 | 保持既有模板或来源记录；明确排除通用文档检查，不声明为现行业务规范 |
| `apps/web/AGENTS.md` | Web Agent Rules | 项目规则或来源说明 | `apps/web/AGENTS.md` | `howto` | 无 | 保留职责边界，更新文档指针 |
| `apps/web/public/fonts/long-cang-SOURCE.md` | Long Cang | 专项模板或第三方来源说明 | `apps/web/public/fonts/long-cang-SOURCE.md` | `excluded` | 无 | 保持既有模板或来源记录；明确排除通用文档检查，不声明为现行业务规范 |
| `docs/2026-09-20-autumn-release-plan.md` | 秋季新版：数据库迁移、部署与压测计划 | 历史快照或验收记录 | `docs/records/2026-09-20-autumn-release-plan.md` | `changelog` | `docs/2026-09-20-questionnaire-migration-audit.md`；`docs/2026-09-20-questionnaire-reset-plan.md`；`docs/2026秋季开学视觉重构/11-正式站实施与验收.md`；`docs/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-20-questionnaire-migration-audit.md` | 新旧问卷与历史答案迁移审计 | 历史快照或验收记录 | `docs/records/2026-09-20-questionnaire-migration-audit.md` | `changelog` | `docs/2026-09-20-autumn-release-plan.md`；`docs/2026-09-20-questionnaire-reset-plan.md`；`docs/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-20-questionnaire-reset-plan.md` | 秋季问卷全量重填与历史数据保留方案 | 历史快照或验收记录 | `docs/records/2026-09-20-questionnaire-reset-plan.md` | `changelog` | `docs/2026-09-20-autumn-release-plan.md`；`docs/2026-09-20-questionnaire-migration-audit.md`；`docs/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-20-release-execution.md` | 秋季问卷发布执行记录 | 历史快照或验收记录 | `docs/records/2026-09-20-release-execution.md` | `changelog` | `docs/2026-09-20-autumn-release-plan.md`；`docs/2026-09-20-questionnaire-reset-plan.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-21-email-brand-authentication.md` | 邮件域名认证与免费 BIMI 配置 | 历史快照或验收记录 | `docs/records/2026-09-21-email-brand-authentication.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-21-profile-basics-reuse.md` | 重用归档中的基础资料 | 历史快照或验收记录 | `docs/records/2026-09-21-profile-basics-reuse.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026-09-21-public-cache-policy.md` | 公开页面缓存策略 | 现行行为契约 | `docs/reference/public-data-cache.md` | `reference` | 无 | 以当前代码核验；把历史运行状态拆入记录 |
| `docs/2026-09-22-server-api-routing.md` | 服务端 API 连接路由 | 现行行为契约 | `docs/reference/server-api-routing.md` | `reference` | 无 | 以当前代码核验；把历史运行状态拆入记录 |
| `docs/2026-09-26-performance-implementation.md` | Performance implementation and acceptance | 历史快照或验收记录 | `docs/records/2026-09-26-performance-implementation.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/01-设计目标与讨论记录.md` | 2026 秋季开学视觉重构：设计目标与讨论记录 | 历史快照或验收记录 | `docs/records/autumn-2026/01-设计目标与讨论记录.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/02-逐项调整记录.md` | 逐项调整记录 | 历史快照或验收记录 | `docs/records/autumn-2026/02-逐项调整记录.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/03-动漫背景素材.md` | 动漫校园背景 | 历史快照或验收记录 | `docs/records/autumn-2026/03-动漫背景素材.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/04-合作高校校徽来源.md` | 合作高校校徽素材 | 历史快照或验收记录 | `docs/records/autumn-2026/04-合作高校校徽来源.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/05-中外合作高校与邮箱核查.md` | 中外合作高校与学生邮箱核查 | 历史快照或验收记录 | `docs/records/autumn-2026/05-中外合作高校与邮箱核查.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/06-注册信息最小化与昵称后置.md` | 注册信息最小化与昵称后置 | 有日期的设计决策 | `docs/decisions/autumn-2026/06-注册信息最小化与昵称后置.md` | `adr` | `docs/2026秋季开学视觉重构/02-逐项调整记录.md`；`docs/2026秋季开学视觉重构/README.md` | 保留采纳、撤回与后续实现之间的边界 |
| `docs/2026秋季开学视觉重构/07-个人资料层级与见面流程退出.md` | 个人资料层级与见面流程退出 | 有日期的设计决策 | `docs/decisions/autumn-2026/07-个人资料层级与见面流程退出.md` | `adr` | `docs/2026秋季开学视觉重构/02-逐项调整记录.md`；`docs/2026秋季开学视觉重构/README.md`；`docs/埋点优化/现有埋点现状.md` | 保留采纳、撤回与后续实现之间的边界 |
| `docs/2026秋季开学视觉重构/08-匹配偏好冗余选项决策.md` | 匹配偏好冗余选项决策 | 有日期的设计决策 | `docs/decisions/autumn-2026/08-匹配偏好冗余选项决策.md` | `adr` | 无 | 保留采纳、撤回与后续实现之间的边界 |
| `docs/2026秋季开学视觉重构/09-资料页容器层级设计原则.md` | 资料页容器层级设计原则与方案 | 有日期的设计决策 | `docs/decisions/autumn-2026/09-资料页容器层级设计原则.md` | `adr` | 无 | 保留采纳、撤回与后续实现之间的边界 |
| `docs/2026秋季开学视觉重构/10-匹配历史退出与举报入口决策.md` | 匹配历史与举报入口决策 | 有日期的设计决策 | `docs/decisions/autumn-2026/10-匹配历史退出与举报入口决策.md` | `adr` | `docs/埋点优化/现有埋点现状.md` | 保留采纳、撤回与后续实现之间的边界 |
| `docs/2026秋季开学视觉重构/11-正式站实施与验收.md` | 正式站实施与验收 | 历史快照或验收记录 | `docs/records/autumn-2026/11-正式站实施与验收.md` | `changelog` | `docs/2026秋季开学视觉重构/README.md`；`docs/validation/2026-09-19-branch-review-cleanup.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/12-Storybook全站覆盖.md` | Storybook 全站覆盖 | 历史快照或验收记录 | `docs/records/autumn-2026/12-Storybook全站覆盖.md` | `changelog` | `docs/2026秋季开学视觉重构/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/13-深度审查问题通俗解读与修复清单.md` | LiLink 工作区深度审查报告通俗解读与修复清单 | 历史快照或验收记录 | `docs/records/autumn-2026/13-深度审查问题通俗解读与修复清单.md` | `changelog` | `docs/2026秋季开学视觉重构/13-深度审查问题通俗解读与修复清单.md`；`docs/2026秋季开学视觉重构/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/14-审查修复与验收.md` | 2026-09-12 审查修复与验收 | 历史快照或验收记录 | `docs/records/autumn-2026/14-审查修复与验收.md` | `changelog` | `docs/2026秋季开学视觉重构/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/15-区号选择与注册动态学校列表.md` | 区号选择与注册动态学校列表 | 历史快照或验收记录 | `docs/records/autumn-2026/15-区号选择与注册动态学校列表.md` | `changelog` | `docs/2026秋季开学视觉重构/14-审查修复与验收.md`；`docs/2026秋季开学视觉重构/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/16-四项修复与旧流程清理.md` | 四项修复与旧流程清理 | 历史快照或验收记录 | `docs/records/autumn-2026/16-四项修复与旧流程清理.md` | `changelog` | `docs/2026秋季开学视觉重构/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/README.md` | 2026 秋季开学视觉重构 | 历史快照或验收记录 | `docs/records/autumn-2026/prototype-origin.md` | `changelog` | `docs/2026秋季开学视觉重构/13-深度审查问题通俗解读与修复清单.md`；`docs/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/design-explorations/home-concept.md` | 首页：活动入口与参与引导设计稿 | 历史快照或验收记录 | `docs/records/autumn-2026/exploration-home-concept.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/design-explorations/mobile-school-layout.md` | 手机学校页布局探索 | 历史快照或验收记录 | `docs/records/autumn-2026/exploration-mobile-school-layout.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/design-explorations/registration-email-concept.md` | 学校邮箱注册视觉探索 | 历史快照或验收记录 | `docs/records/autumn-2026/exploration-registration-email-concept.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/2026秋季开学视觉重构/web/AGENTS.md` | Web Agent Rules | 原型内部说明 | `prototypes/autumn-2026/web/AGENTS.md` | `excluded` | 无 | 原型源码与授权来源随副本保存；不作为现行应用规范 |
| `docs/2026秋季开学视觉重构/web/public/fonts/long-cang-SOURCE.md` | Long Cang | 原型内部说明 | `prototypes/autumn-2026/web/public/fonts/long-cang-SOURCE.md` | `excluded` | 无 | 原型源码与授权来源随副本保存；不作为现行应用规范 |
| `docs/PRD模板.md` | [产品名称][版本]_PRD | 待实施方案或模板 | `docs/templates/feature-plan.md` | `plan` | `docs/README.md`；`docs/丘比特活动机制/README.md`；`docs/埋点优化/README.md` | 不把提案当成已上线能力 |
| `docs/README.md` | LiLink 设计与技术文档 (docs) | 分类导航 | `docs/README.md` | `readme` | `docs/2026-09-20-autumn-release-plan.md`；`docs/2026-09-20-questionnaire-migration-audit.md`；`docs/2026-09-20-questionnaire-reset-plan.md`；`docs/PRD模板.md`；`docs/丘比特活动机制/README.md`；`docs/埋点优化/README.md` | 建立职责边界与唯一维护入口 |
| `docs/archive/2026-04-12-matching-api-for-frontend.md` | 匹配 API 给前端的说明 | 历史快照或验收记录 | `docs/archive/2026-04-12-matching-api-for-frontend.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-04-12-operations-notes.md` | LiLink 运维笔记 | 历史快照或验收记录 | `docs/archive/2026-04-12-operations-notes.md` | `changelog` | `docs/archive/2026-04-12-operations-notes.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-04-12-recent-match-history-api.md` | 最近三次匹配记录 API | 历史快照或验收记录 | `docs/archive/2026-04-12-recent-match-history-api.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-14-meetup-contract-design.md` | 见面会话合同与设计 | 历史快照或验收记录 | `docs/archive/2026-05-14-meetup-contract-design.md` | `changelog` | `README.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-15-meetup-icebreak-manual-testing.md` | 破冰手工测试指南 | 历史快照或验收记录 | `docs/archive/2026-05-15-meetup-icebreak-manual-testing.md` | `changelog` | `README.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-21-invite-code-system-plan.md` | 邀请码系统 Implementation Plan | 历史快照或验收记录 | `docs/archive/2026-05-21-invite-code-system-plan.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-21-invite-code-system.md` | 邀请码系统设计（Invite Code System） | 历史快照或验收记录 | `docs/archive/2026-05-21-invite-code-system.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-21-pwa-adaptation-plan.md` | LiLink PWA Adaptation Implementation Plan | 历史快照或验收记录 | `docs/archive/2026-05-21-pwa-adaptation-plan.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-21-pwa-adaptation.md` | LiLink PWA 适配设计 | 历史快照或验收记录 | `docs/archive/2026-05-21-pwa-adaptation.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-22-merchant-promotion-contract-design.md` | 商家核销与推广系统：合同与设计 | 历史快照或验收记录 | `docs/archive/2026-05-22-merchant-promotion-contract-design.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-22-merchant-promotion-plan-and-todo.md` | 商家核销与推广系统：实施计划与待办清单 | 历史快照或验收记录 | `docs/archive/2026-05-22-merchant-promotion-plan-and-todo.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-22-merchant-promotion-system-design.md` | 商家核销与推广系统 — 设计文档 | 历史快照或验收记录 | `docs/archive/2026-05-22-merchant-promotion-system-design.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-23-merchant-coupon-rule-and-redemption.md` | 优惠券阶梯规则与核销求值 | 历史快照或验收记录 | `docs/archive/2026-05-23-merchant-coupon-rule-and-redemption.md` | `changelog` | `README.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-23-merchant-promotion-manual-testing.md` | 商家核销与推广系统 手工测试指南 | 历史快照或验收记录 | `docs/archive/2026-05-23-merchant-promotion-manual-testing.md` | `changelog` | `README.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-23-web-design-system.md` | LiLink Web 设计系统边界 | 历史快照或验收记录 | `docs/archive/2026-05-23-web-design-system.md` | `changelog` | `README.md`；`docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-24-merchant-redemption-qr-totp-redesign.md` | 商家核销重构：动态二维码 + TOTP + 用户端推广展示 | 历史快照或验收记录 | `docs/archive/2026-05-24-merchant-redemption-qr-totp-redesign.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-05-24-referral-channel-two-layer-redesign.md` | 邀请渠道分类两层重构（设计 spec · 草案） | 历史快照或验收记录 | `docs/archive/2026-05-24-referral-channel-two-layer-redesign.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-06-01-devlog-integration-design.md` | 将 devlog 集成进 LiLink 主应用 — 设计文档 | 历史快照或验收记录 | `docs/archive/2026-06-01-devlog-integration-design.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-06-02-production-release-flow.md` | Production Release Flow | 现行操作说明 | `docs/guides/production-release.md` | `howto` | `AGENTS.md`；`README.md`；`docs/archive/2026-04-12-operations-notes.md`；`docs/archive/2026-09-08-local-development.md`；`docs/archive/2026-10-01-handover-consolidation.md`；`docs/archive/README.md` | 核对脚本后建立唯一操作入口 |
| `docs/archive/2026-06-06-referral-non-edu-invite-limit.md` | LiLink 个人推荐码注册与非教育邮箱次数风控开发计划书 | 历史快照或验收记录 | `docs/archive/2026-06-06-referral-non-edu-invite-limit.md` | `changelog` | `docs/archive/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/archive/2026-09-08-local-development.md` | Local Development | 现行操作说明 | `docs/guides/local-development.md` | `howto` | `AGENTS.md`；`README.md`；`docs/archive/2026-04-12-operations-notes.md`；`docs/archive/2026-10-01-handover-consolidation.md`；`docs/archive/README.md` | 核对脚本后建立唯一操作入口 |
| `docs/archive/2026-09-08-web-visual-verification.md` | Web Visual Verification | 现行操作说明 | `docs/guides/visual-verification.md` | `howto` | `README.md`；`apps/web/AGENTS.md`；`docs/archive/README.md` | 核对脚本后建立唯一操作入口 |
| `docs/archive/2026-09-16-one-to-one-paid-frontend/README.md` | 人工匹配付费版前端备份 | 分类导航 | `prototypes/one-to-one-paid-2026-09-16/README.md` | `readme` | 无 | 建立职责边界与唯一维护入口 |
| `docs/archive/2026-10-01-handover-consolidation.md` | 旧交接资料统一归档 | 历史快照或验收记录 | `docs/records/2026-10-01-documentation-reorganization.md` | `changelog` | `docs/archive/README.md` | 原独立归档说明已撤销；内容融合与历史去向由重整记录维护 |
| `docs/archive/README.md` | LiLink 文档归档 | 分类导航 | `docs/archive/README.md` | `readme` | `README.md`；`docs/README.md`；`docs/archive/2026-10-01-handover-consolidation.md` | 建立职责边界与唯一维护入口 |
| `docs/e2e-testing.md` | 浏览器自动化测试 | 现行操作说明 | `docs/guides/browser-e2e.md` | `howto` | `docs/archive/2026-10-01-handover-consolidation.md`；`docs/validation/2026-09-26-loading-performance.md` | 核对脚本后建立唯一操作入口 |
| `docs/matching-priority.md` | 自动匹配优先级 | 现行行为契约 | `docs/reference/matching.md` | `reference` | 无 | 以当前代码核验；把历史运行状态拆入记录 |
| `docs/validation/2026-09-14-match-leads.md` | 人工匹配手机号登记 | 历史快照或验收记录 | `docs/validation/2026-09-14-match-leads.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-14-one-to-one-page.md` | 1 对 1 恋爱匹配活动页 | 历史快照或验收记录 | `docs/validation/2026-09-14-one-to-one-page.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-15-legal-pages.md` | 协议与隐私页面改版 | 历史快照或验收记录 | `docs/validation/2026-09-15-legal-pages.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-15-school-cn-aliases.md` | 学校邮箱 .cn 后缀支持 | 历史快照或验收记录 | `docs/validation/2026-09-15-school-cn-aliases.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-admin-cycles-flat.md` | 轮次列表常驻与统一编辑 | 历史快照或验收记录 | `docs/validation/2026-09-16-admin-cycles-flat.md` | `changelog` | `docs/validation/2026-09-16-admin-cycles-workbench.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-admin-cycles-workbench.md` | 轮次中心：图表、预演与审计整合 | 历史快照或验收记录 | `docs/validation/2026-09-16-admin-cycles-workbench.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-admin-redesign.md` | 2026-09-16 后台视觉重构 | 历史快照或验收记录 | `docs/validation/2026-09-16-admin-redesign.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-admin-user-status.md` | 用户详情状态与操作区分 | 历史快照或验收记录 | `docs/validation/2026-09-16-admin-user-status.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-independent-promotion.md` | 常态邀请推广与商户活动拆分 | 历史快照或验收记录 | `docs/validation/2026-09-16-independent-promotion.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-16-registration-capacity-removal.md` | 注册容量限制移除验收 | 历史快照或验收记录 | `docs/validation/2026-09-16-registration-capacity-removal.md` | `changelog` | `docs/validation/2026-09-16-admin-redesign.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-17-profile-lifestyle-vip.md` | 生活习惯与 VIP 高级筛选验收 | 历史快照或验收记录 | `docs/validation/2026-09-17-profile-lifestyle-vip.md` | `changelog` | `docs/validation/2026-09-19-branch-review-cleanup.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-17-school-directory-sync.md` | 本地学校名单与邮箱后缀统一 | 历史快照或验收记录 | `docs/validation/2026-09-17-school-directory-sync.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-17-user-center.md` | 用户中心重启验收 | 历史快照或验收记录 | `docs/validation/2026-09-17-user-center.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-18-vip-redesign.md` | VIP 页面视觉改版 | 历史快照或验收记录 | `docs/validation/2026-09-18-vip-redesign.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-19-branch-review-cleanup.md` | 分支深度审查与冗余清理 | 历史快照或验收记录 | `docs/validation/2026-09-19-branch-review-cleanup.md` | `changelog` | `docs/validation/2026-09-19-review-fixes.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-19-contact-disclosure-fix.md` | 联系方式公开权限修复与验收 | 历史快照或验收记录 | `docs/validation/2026-09-19-contact-disclosure-fix.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-19-review-fixes.md` | 分支审查问题修复 | 历史快照或验收记录 | `docs/validation/2026-09-19-review-fixes.md` | `changelog` | `docs/validation/2026-09-19-branch-review-cleanup.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-20-branch-review-fixes.md` | 生产前分支审查修复验收 | 历史快照或验收记录 | `docs/validation/2026-09-20-branch-review-fixes.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-20-browser-e2e.md` | 浏览器 E2E 基础设施验收 | 历史快照或验收记录 | `docs/validation/2026-09-20-browser-e2e.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-20-dependency-security-review.md` | 2026-09-20 发布前依赖安全复核 | 历史快照或验收记录 | `docs/validation/2026-09-20-dependency-security-review.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-20-iterative-review-fixes.md` | 2026-09-20 迭代审查与修复 | 历史快照或验收记录 | `docs/validation/2026-09-20-iterative-review-fixes.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-20-review-fixes.md` | 2026-09-20 Review 修复验证 | 历史快照或验收记录 | `docs/validation/2026-09-20-review-fixes.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-coupon-overview-consistency.md` | 优惠券概览并发一致性验收（2026-09-26） | 历史快照或验收记录 | `docs/validation/2026-09-26-coupon-overview-consistency.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-deep-cleanup.md` | 资料页与账户模块职责拆分 | 历史快照或验收记录 | `docs/validation/2026-09-26-deep-cleanup.md` | `changelog` | `docs/validation/2026-09-26-redundant-code-cleanup.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-loading-performance.md` | Loading and read-path performance validation | 历史快照或验收记录 | `docs/validation/2026-09-26-loading-performance.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-pr-integration.md` | PR 134 / 135 integration validation | 历史快照或验收记录 | `docs/validation/2026-09-26-pr-integration.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-redundant-code-cleanup.md` | 冗余测试与内部兼容代码清理 | 历史快照或验收记录 | `docs/validation/2026-09-26-redundant-code-cleanup.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/2026-09-26-storybook-bootstrap-coverage.md` | Storybook bootstrap coverage follow-up | 历史快照或验收记录 | `docs/validation/2026-09-26-storybook-bootstrap-coverage.md` | `changelog` | 无 | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/validation/local-community-simulation.md` | 首页本地数据库仿真 | 现行操作说明 | `docs/guides/community-simulation.md` | `howto` | 无 | 核对脚本后建立唯一操作入口 |
| `docs/vip-activation.md` | VIP 收款与激活 | 历史快照或验收记录 | `docs/records/2026-09-17-vip-launch.md` | `changelog` | `docs/validation/2026-09-19-review-fixes.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/丘比特活动机制/2026-09-11-secret-wingman-matchmaking-mechanism.md` | 偷偷助攻与双人撮合机制设计（丘比特活动 · Project Cupid） | 待实施方案或模板 | `docs/plans/2026-09-11-cupid.md` | `plan` | `docs/README.md`；`docs/丘比特活动机制/README.md` | 不把提案当成已上线能力 |
| `docs/丘比特活动机制/README.md` | 丘比特活动机制（Project Cupid） | 历史快照或验收记录 | `docs/archive/2026-09-11-cupid-index.md` | `changelog` | `docs/丘比特活动机制/2026-09-11-secret-wingman-matchmaking-mechanism.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/埋点优化/2026-09-13-自动引荐与旧事件退役.md` | 自动引荐与旧事件退役 | 历史快照或验收记录 | `docs/records/2026-09-13-product-events-retirement.md` | `changelog` | `docs/埋点优化/README.md`；`docs/埋点优化/现有埋点现状.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/埋点优化/2026-09-16-后台精简与自建埋点退役.md` | 后台精简与自建埋点退役 | 历史快照或验收记录 | `docs/records/2026-09-16-product-events-retirement.md` | `changelog` | `docs/埋点优化/2026-09-13-自动引荐与旧事件退役.md`；`docs/埋点优化/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/埋点优化/README.md` | 埋点优化与数据体系 | 历史快照或验收记录 | `docs/archive/2026-09-11-analytics-index.md` | `changelog` | `docs/埋点优化/2026-09-13-自动引荐与旧事件退役.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `docs/埋点优化/现有埋点现状.md` | LiLink 现有埋点现状 | 历史快照或验收记录 | `docs/archive/2026-09-11-product-analytics-audit.md` | `changelog` | `docs/README.md`；`docs/埋点优化/2026-09-13-自动引荐与旧事件退役.md`；`docs/埋点优化/README.md` | 保留原始日期、来源提交和验证局限；代码链接固定历史版本 |
| `scripts/release/README.md` | Isolated release checks | 有日期的演练工具说明 | `docs/records/2026-09-26-isolated-release-tools.md` | `changelog` | 无 | 分离固定资源与当时运行观察；现行指南说明源码约束和准备边界 |

## 旧说明按主题融合

初次迁移暂存了 2026-09-03 的七份说明与两份导航；同日进一步按主题核对七份原稿的 59 个二级章节，取消独立原件目录、导航和归档占位页。有效内容进入下列维护位置，重复内容引用既有契约；过时流程按源码修正，旧资源标识、凭据和聚合用户统计不发布。

| 原稿主题 | 融合位置 | 处理边界 |
| --- | --- | --- |
| 总览与导航 | [项目文档](../README.md)、[维护流程](../guides/documentation.md) | 合并入口与事实判断方法，撤销平行目录 |
| 产品与业务全景 | [产品主链路](../reference/product.md)、账户、匹配、VIP 与券参考 | 核对当前流程，移除容量锁、自动继承、双向请求和见面协商等旧规则 |
| 系统架构与数据模型 | [系统拓扑](../reference/topology.md)、[账户边界](../reference/account.md) | 补齐模块职责、领域不变量与认证边界，工具链引用开发指南 |
| 生产环境与基础设施 | [生产发布](../guides/production-release.md)、[故障排查](../guides/incident-response.md) | 保存配置、任务与依赖契约；旧主机、数据库和运行统计不作为当前现场事实 |
| 新环境重建与迁移方案 | [环境迁移指南](../guides/environment-migration.md)、[迁移计划](../plans/environment-migration.md) | 方法与未决选择分别维护，不宣称已执行切换 |
| 运维发布与故障排查 | [发布指南](../guides/production-release.md)、[值守指南](../guides/incident-response.md) | 修正管理员创建、数据库健康判断、维护开关与自动轮次行为 |
| 项目背景总稿 | 上述主题页与 [项目历史](project-history.md) | 与六份拆分稿合并；独有组织资产设想保留日期与提案效力 |

章节清单只包含来源文件名、哈希、标题与去向，保存在本机 artifacts/docs-fusion-20261001；不复制原文。后续维护直接使用主题文档，迁移清单不是另一套业务规范。

## 本次新增文档归属

以下条目原路径为“新建”；目标就是其维护位置，入链按归并后的索引核对。分类入口负责导航，参考负责事实，操作页负责步骤，记录保存时间与环境边界。新增的理由是补齐职责、分离历史观察或建立可重复验收。

| 原路径 | 用途 | 效力 | 目标路径与类型 | 引用它的文件 | 处理理由 |
| --- | --- | --- | --- | --- | --- |
| 新建 | 设计决策 | 分类入口 | [docs/decisions/README.md](../decisions/README.md) / readme | `docs/README.md`；`docs/records/2026-10-01-document-migration.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 秋季设计决策 | 分类入口 | [docs/decisions/autumn-2026/README.md](../decisions/autumn-2026/README.md) / readme | `docs/decisions/autumn-2026/06-注册信息最小化与昵称后置.md`；`docs/decisions/autumn-2026/07-个人资料层级与见面流程退出.md`；`docs/decisions/autumn-2026/08-匹配偏好冗余选项决策.md`；`docs/decisions/autumn-2026/09-资料页容器层级设计原则.md`；`docs/decisions/autumn-2026/10-匹配历史退出与举报入口决策.md`；`docs/plans/open-questions.md`；`docs/records/2026-10-01-document-migration.md`；`prototypes/autumn-2026/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 操作指南 | 分类入口 | [docs/guides/README.md](../guides/README.md) / readme | `docs/README.md`；`docs/guides/browser-e2e.md`；`docs/guides/community-simulation.md`；`docs/guides/documentation.md`；`docs/guides/incident-response.md`；`docs/guides/local-development.md`；`docs/guides/production-release.md`；`docs/guides/release-rehearsal.md`；`docs/guides/vip-operations.md`；`docs/guides/visual-verification.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-guide-provenance.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 用 Seiso 维护项目文档 | 现行维护与操作 | [docs/guides/documentation.md](../guides/documentation.md) / howto | `AGENTS.md`；`README.md`；`docs/README.md`；`docs/archive/README.md`；`docs/decisions/README.md`；`docs/decisions/autumn-2026/README.md`；`docs/guides/README.md`；`docs/plans/README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-documentation-reorganization.md`；`docs/records/README.md`；`docs/records/autumn-2026/README.md`；`docs/reference/README.md`；`docs/templates/README.md`；`docs/validation/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 值守与故障排查 | 现行故障排查 | [docs/guides/incident-response.md](../guides/incident-response.md) / runbook | `docs/guides/README.md`；`docs/guides/production-release.md`；`docs/records/2026-10-01-document-migration.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 隔离环境发布演练 | 现行维护与操作 | [docs/guides/release-rehearsal.md](../guides/release-rehearsal.md) / howto | `docs/guides/README.md`；`docs/records/2026-09-26-isolated-release-tools.md`；`docs/records/2026-10-01-document-migration.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | VIP 卡密运营 | 现行维护与操作 | [docs/guides/vip-operations.md](../guides/vip-operations.md) / howto | `docs/guides/README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/reference/vip.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 实施计划 | 分类入口 | [docs/plans/README.md](../plans/README.md) / readme | `docs/README.md`；`docs/plans/2026-09-11-cupid.md`；`docs/plans/open-questions.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/project-history.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 文档核验后的待确认事项 | 待确认事项 | [docs/plans/open-questions.md](../plans/open-questions.md) / plan | `docs/decisions/autumn-2026/08-匹配偏好冗余选项决策.md`；`docs/plans/README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-documentation-reorganization.md`；`prototypes/autumn-2026/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | API 服务端连接排查观察 | 有日期的记录 | [docs/records/2026-09-22-server-api-observation.md](2026-09-22-server-api-observation.md) / changelog | `docs/records/2026-10-01-document-migration.md`；`docs/records/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 文档重整清单与迁移表 | 有日期的记录 | [docs/records/2026-10-01-document-migration.md](2026-10-01-document-migration.md) / changelog | `docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-documentation-reorganization.md`；`docs/records/README.md`；`docs/records/project-history.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | Seiso 文档重整实施与验收 | 有日期的记录 | [docs/records/2026-10-01-documentation-reorganization.md](2026-10-01-documentation-reorganization.md) / changelog | `docs/plans/open-questions.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/README.md`；`prototypes/autumn-2026/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 开发与发布指南的历史来源 | 有日期的记录 | [docs/records/2026-10-01-guide-provenance.md](2026-10-01-guide-provenance.md) / changelog | `docs/records/2026-10-01-document-migration.md`；`docs/records/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 实施记录 | 分类入口 | [docs/records/README.md](README.md) / readme | `docs/README.md`；`docs/guides/production-release.md`；`docs/guides/release-rehearsal.md`；`docs/records/2026-09-13-product-events-retirement.md`；`docs/records/2026-09-16-product-events-retirement.md`；`docs/records/2026-09-17-vip-launch.md`；`docs/records/2026-09-20-autumn-release-plan.md`；`docs/records/2026-09-20-questionnaire-migration-audit.md`；`docs/records/2026-09-20-questionnaire-reset-plan.md`；`docs/records/2026-09-20-release-execution.md`；`docs/records/2026-09-21-email-brand-authentication.md`；`docs/records/2026-09-21-profile-basics-reuse.md`；`docs/records/2026-09-22-server-api-observation.md`；`docs/records/2026-09-26-isolated-release-tools.md`；`docs/records/2026-09-26-performance-implementation.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-documentation-reorganization.md`；`docs/records/2026-10-01-guide-provenance.md`；`docs/records/project-history.md`；`docs/reference/account.md`；`docs/reference/server-api-routing.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 秋季开发记录 | 分类入口 | [docs/records/autumn-2026/README.md](autumn-2026/README.md) / readme | `docs/records/2026-10-01-document-migration.md`；`docs/records/autumn-2026/01-设计目标与讨论记录.md`；`docs/records/autumn-2026/02-逐项调整记录.md`；`docs/records/autumn-2026/03-动漫背景素材.md`；`docs/records/autumn-2026/04-合作高校校徽来源.md`；`docs/records/autumn-2026/05-中外合作高校与邮箱核查.md`；`docs/records/autumn-2026/11-正式站实施与验收.md`；`docs/records/autumn-2026/12-Storybook全站覆盖.md`；`docs/records/autumn-2026/13-深度审查问题通俗解读与修复清单.md`；`docs/records/autumn-2026/14-审查修复与验收.md`；`docs/records/autumn-2026/15-区号选择与注册动态学校列表.md`；`docs/records/autumn-2026/16-四项修复与旧流程清理.md`；`docs/records/autumn-2026/exploration-home-concept.md`；`docs/records/autumn-2026/exploration-mobile-school-layout.md`；`docs/records/autumn-2026/exploration-registration-email-concept.md`；`docs/records/autumn-2026/prototype-origin.md`；`prototypes/autumn-2026/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | Git 开发历史与文档事件边界 | 有日期的记录 | [docs/records/project-history.md](project-history.md) / changelog | `README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/records/2026-10-01-documentation-reorganization.md`；`docs/records/README.md`；`docs/records/project-history.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 现行参考 | 分类入口 | [docs/reference/README.md](../reference/README.md) / readme | `docs/README.md`；`docs/guides/local-development.md`；`docs/records/2026-09-22-server-api-observation.md`；`docs/records/2026-10-01-document-migration.md`；`docs/reference/account.md`；`docs/reference/analytics.md`；`docs/reference/coupons.md`；`docs/reference/matching.md`；`docs/reference/public-data-cache.md`；`docs/reference/server-api-routing.md`；`docs/reference/topology.md`；`docs/reference/vip.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 账户、资料与问卷边界 | 现行事实维护位置 | [docs/reference/account.md](../reference/account.md) / reference | `docs/records/2026-10-01-document-migration.md`；`docs/reference/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 运营统计与退役产品事件 | 现行事实维护位置 | [docs/reference/analytics.md](../reference/analytics.md) / reference | `docs/records/2026-10-01-document-migration.md`；`docs/reference/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 活动优惠券与核销契约 | 现行事实维护位置 | [docs/reference/coupons.md](../reference/coupons.md) / reference | `docs/records/2026-10-01-document-migration.md`；`docs/reference/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 系统职责、数据流与部署拓扑 | 现行事实维护位置 | [docs/reference/topology.md](../reference/topology.md) / reference | `docs/guides/community-simulation.md`；`docs/guides/production-release.md`；`docs/plans/open-questions.md`；`docs/records/2026-10-01-document-migration.md`；`docs/reference/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | VIP 权益与兑换契约 | 现行事实维护位置 | [docs/reference/vip.md](../reference/vip.md) / reference | `docs/guides/vip-operations.md`；`docs/records/2026-10-01-document-migration.md`；`docs/reference/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 文档模板 | 分类入口 | [docs/templates/README.md](../templates/README.md) / readme | `docs/README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/templates/feature-plan.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 验收记录 | 分类入口 | [docs/validation/README.md](../validation/README.md) / readme | `docs/README.md`；`docs/records/2026-10-01-document-migration.md`；`docs/validation/2026-09-14-match-leads.md`；`docs/validation/2026-09-14-one-to-one-page.md`；`docs/validation/2026-09-15-legal-pages.md`；`docs/validation/2026-09-15-school-cn-aliases.md`；`docs/validation/2026-09-16-admin-cycles-flat.md`；`docs/validation/2026-09-16-admin-cycles-workbench.md`；`docs/validation/2026-09-16-admin-redesign.md`；`docs/validation/2026-09-16-admin-user-status.md`；`docs/validation/2026-09-16-independent-promotion.md`；`docs/validation/2026-09-16-registration-capacity-removal.md`；`docs/validation/2026-09-17-profile-lifestyle-vip.md`；`docs/validation/2026-09-17-school-directory-sync.md`；`docs/validation/2026-09-17-user-center.md`；`docs/validation/2026-09-18-vip-redesign.md`；`docs/validation/2026-09-19-branch-review-cleanup.md`；`docs/validation/2026-09-19-contact-disclosure-fix.md`；`docs/validation/2026-09-19-review-fixes.md`；`docs/validation/2026-09-20-branch-review-fixes.md`；`docs/validation/2026-09-20-browser-e2e.md`；`docs/validation/2026-09-20-dependency-security-review.md`；`docs/validation/2026-09-20-iterative-review-fixes.md`；`docs/validation/2026-09-20-review-fixes.md`；`docs/validation/2026-09-26-coupon-overview-consistency.md`；`docs/validation/2026-09-26-deep-cleanup.md`；`docs/validation/2026-09-26-loading-performance.md`；`docs/validation/2026-09-26-pr-integration.md`；`docs/validation/2026-09-26-redundant-code-cleanup.md`；`docs/validation/2026-09-26-storybook-bootstrap-coverage.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 原型与历史实现素材 | 分类入口 | [prototypes/README.md](../../prototypes/README.md) / readme | `docs/README.md`；`docs/records/2026-10-01-document-migration.md`；`prototypes/autumn-2026/README.md`；`prototypes/one-to-one-paid-2026-09-16/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
| 新建 | 秋季视觉设计副本 | 分类入口 | [prototypes/autumn-2026/README.md](../../prototypes/autumn-2026/README.md) / readme | `docs/records/2026-10-01-document-migration.md`；`prototypes/README.md` | 补齐职责与维护入口，原稿通过历史来源追溯 |
