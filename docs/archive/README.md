# LiLink 文档归档

本 README 是归档目录入口。其余文档采用 `YYYY-MM-DD-topic.md` 命名，直接放在本目录，按文件名即可依时间升序排列。设计稿和实施计划分别用主题名及 `-plan` 区分。日期主要取文档最初形成时间，拓扑快照采用修订日期。

这些资料是历史快照，不代表其中所有功能、字段、命令和待办仍然有效。来源提交与原路径保存在各文档开头；旧计划中的 Agent 指令不作为当前执行规则。

## 公开归档

| 日期 | 文档 | 来源提交 |
| --- | --- | --- |
| 2026-04-12 | [匹配 API 给前端的说明](2026-04-12-matching-api-for-frontend.md) | `9bffcce` |
| 2026-04-12 | [最近三次匹配记录 API](2026-04-12-recent-match-history-api.md) | `9bffcce` |
| 2026-05-14 | [见面会话合同与设计](2026-05-14-meetup-contract-design.md) | `a6b1bf4` |
| 2026-05-15 | [破冰手工测试指南](2026-05-15-meetup-icebreak-manual-testing.md) | `a6b1bf4` |
| 2026-05-21 | [邀请码系统 Implementation Plan](2026-05-21-invite-code-system-plan.md) | `11d778d` |
| 2026-05-21 | [邀请码系统设计（Invite Code System）](2026-05-21-invite-code-system.md) | `11d778d` |
| 2026-05-21 | [LiLink PWA Adaptation Implementation Plan](2026-05-21-pwa-adaptation-plan.md) | `fbeee15` |
| 2026-05-21 | [LiLink PWA 适配设计](2026-05-21-pwa-adaptation.md) | `fbeee15` |
| 2026-05-22 | [商家核销与推广系统：合同与设计](2026-05-22-merchant-promotion-contract-design.md) | `8ad111f` |
| 2026-05-22 | [商家核销与推广系统：实施计划与待办清单](2026-05-22-merchant-promotion-plan-and-todo.md) | `665c0bd` |
| 2026-05-22 | [商家核销与推广系统 — 设计文档](2026-05-22-merchant-promotion-system-design.md) | `e4f99a6` |
| 2026-05-23 | [优惠券阶梯规则与核销求值](2026-05-23-merchant-coupon-rule-and-redemption.md) | `a6b1bf4` |
| 2026-05-23 | [商家核销与推广系统 手工测试指南](2026-05-23-merchant-promotion-manual-testing.md) | `a6b1bf4` |
| 2026-05-23 | [LiLink Web 设计系统边界](2026-05-23-web-design-system.md) | `a6b1bf4` |
| 2026-05-24 | [商家核销重构：动态二维码 + TOTP + 用户端推广展示](2026-05-24-merchant-redemption-qr-totp-redesign.md) | `a6b1bf4` |
| 2026-05-24 | [邀请渠道分类两层重构（设计 spec · 草案）](2026-05-24-referral-channel-two-layer-redesign.md) | `8ad111f` |
| 2026-06-01 | [将 devlog 集成进 LiLink 主应用 — 设计文档](2026-06-01-devlog-integration-design.md) | `a6b1bf4` |
| 2026-06-02 | [Production Release Flow](2026-06-02-production-release-flow.md) | `a6b1bf4` |
| 2026-06-06 | [LiLink 个人推荐码注册与非教育邮箱次数风控开发计划书](2026-06-06-referral-non-edu-invite-limit.md) | `b3da8c2` |
| 2026-09-08 | [Local Development](2026-09-08-local-development.md) | `a6b1bf4` |
| 2026-09-08 | [Web Visual Verification](2026-09-08-web-visual-verification.md) | `a6b1bf4` |

## 本地运维资料

运维笔记、生产拓扑及旧测试运维手册仅保存在本机，已加入 Git 和 Docker 忽略规则，不随公开仓库发布。公开索引不链接这些本地文件。

## 阅读提示

- 商家早期合同中的运营邀请码、手动领取及旧核销方案已有后续调整。
- 旧邀请码设计面向招募人运营码；普通邮箱注册应结合 2026-06-06 的个人推荐码资料和当前实现理解。
- 最近匹配记录文档中的 `latestMatch` 语义已变化；以当前 API DTO、service 和测试为准。
- PWA 旧文档中的 Node 版本、缓存范围与工具指令需要按当前项目核对。
- 本地开发、视觉验证与生产发布的入口已同步到对应归档文件，执行前仍应检查当前脚本。
