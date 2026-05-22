# 商家核销与推广系统：实施计划与待办清单

本文档记录**已完成的实施**与**待后续技术人员判断/实施的 to-do-list**。设计依据见 `docs/merchant-promotion-contract-design.zh-CN.md`（实现合同，权威）。

- 分支：`feat/merchant-system`（基于 `main`）
- 截至：2026-05-22

---

## 一、已完成

### M0 数据模型地基 ✅（commit `be183da`）
- Prisma schema：6 枚举 + 8 模型（Campaign / CouponTemplate / CampaignActivation / Coupon / Merchant / MerchantUser / Redemption / ReferralEvent）+ User/InviteCode 扩展字段。
- 迁移 `apps/api/prisma/migrations/20260522120000_merchant_promotion_system/`（含手写 partial unique index `campaign_single_active_default`）。**⚠️ 尚未 apply**（本机无运行的 DB）。
- `@lilink/shared`：`referral / campaign / coupon / merchant / human-code` 模块 + `generateHumanCode`（Web Crypto + rejection sampling，长度 8/10/10）。
- §A 优惠规则 / §B 核销求值仅落地**数据列 + 最简 stub**（不含 DSL/金额逻辑）。
- 验证：`prisma validate`/`generate`、`build:shared`、`nest build`、invite-code spec 10/10。经 codex 检查无架构 Blocker。

### M1 邀请追踪 — api ✅（commits `262a7f3` / `eafff5c` / `5b19e78` / `8d13738` / `2f78536`）
单元测试级 + 编译通过；**集成/e2e 待 DB**。
- referral 模块：
  - `assignReferralCodeIfMissing`：整体吞错不阻断注册、`updateMany` null-guard CAS 防并发覆盖、唯一碰撞重试。
  - `resolveRegistrationAttribution`：归属优先级（运营码快照 > 个人码 ACTIVE 链接活动 > ACTIVE default > none）；支持传入 tx，**注册事务内冻结**。
- 注册接入：`auth.register` 解析并冻结归属写入 `user.create`、注册后赋个人码；`RegisterDto` + `referralCode/channel/campaignSlug`。
- 激活信号：`account.setParticipation` 首次 opt-in 回填 `User.firstOptedInAt`（null-guard、opt-out 不碰）。
- 端点：`GET /me/referral`（个人码 + 各渠道分享链接 + 邀请漏斗）、`POST /referral/events`（SHARE，JWT）、`POST /referral/click`（CLICK，公共 + 限流，按 code+day+visitorHash UV 去重；visitorHash = 盐(JWT_SECRET)+ip+ua，原始 IP/UA 不存）。
- 单元测试：referral 20/20、auth 34/34、account 49/49；`nest build` green。经两轮 codex 检查（Blocker + should-fix 修复）。

### M2 优惠券 — api ✅（待提交；codex 审查中）
基于已合并的 `origin/main`（#53 首页/问卷/agent 基建）；单元测试级 + 编译通过，集成/e2e 待补。
- 已合并 `origin/main`（#53）入分支：解决 `schema.prisma` 冲突（保留 merchant 模型/字段 + 采纳 #53 的 `MatchFeedback` / `Match.feedback` / `Question` / 硬匹配签名），`lilink_merchant` 全量迁移，build + 单测 421 + e2e 15 绿。
- `@lilink/shared`：`validateMerchantPromotionBlocks`（promotionBlocks 结构 / https / 数量上限校验 + 归一化）。
- merchant 模块：Merchant 实体后台 CRUD（`AdminGuard`，create/list/update，含 promotionBlocks）；spec 8/8。
- campaign 模块：Campaign CRUD（「单个 ACTIVE+isDefault」partial-unique 的事务内降级其它默认 + ENDED 强制取消默认）+ CouponTemplate CRUD（merchant 存在/启用校验、`validDays`/`validUntil` 互斥、rule 走 stub、`campaignId`/`merchantId` 不可改）；spec 16/16。
- activation 模块：`tryGrantCoupons` 幂等发券（precondition=`submittedAt`+`firstOptedInAt`、仅 ACTIVE 冻结归属 campaign、`couponsGrantedAt` 幂等闸、预查跳过已发 + `(userId,templateId)` 兜底、coupon code 撞唯一重试、expiresAt 按 validUntil/validDays）；接入 `account.saveQuestionnaire`/`setParticipation`（事务提交后 try/catch、不阻断主流程）；spec 10/10。
- coupon 模块：`GET /me/coupons`（`effectiveCouponStatus` 分区 + 核销码可见）；spec 5/5。
- `deleteAllTestUsers` 扩展：按 `Redemption→Coupon→CampaignActivation→ReferralEvent` 顺序清理（Restrict 外键），`referredByUserId` 为 SET NULL 不需手动解。
- 验证：`nest build` green；api 单测 **421/421**。§A 优惠规则 `rule` 仍走 `validateCouponRule` stub；§B 核销求值未启用。
- 提交：M2 `b16ccd6`，已 push + CI 绿。

### M3 商家核销 + M4 数据看板 + 全套 web ✅（已 push + CI 绿）
**M3 商家核销 api**（codex 审查：0 核销 Blocker；修复 2 Blocker/4 should-fix/nit）：MerchantUser 账号后台 CRUD（argon2、审计不暴露 passwordHash）、商家登录 merchant-session（独立 cookie + `MERCHANT_JWT_SECRET` + 登录限流 + timing dummy）、`MerchantGuard`（merchant user 与 merchant 双 active）、`POST /merchant/redeem` 事务内条件 `updateMany` 三态（仅本商家模板 + ACTIVE 持券 + 未过期；count 0 区分 ALREADY_USED/INVALID 不泄露存在性）+ 推广位返回；§B 金额求值 stub。
**M4 数据看板 api**（`admin/promotion`，AdminGuard）：funnel（6 步 + byGender + conversions）/ leaderboard（个人码/运营码分性别分页）/ coupons（按商家）/ redemptions（按商家 + Asia/Shanghai 天）；campaignId + 时间范围必选、isTest 排除、最大跨度保护。
**web**（codex 审查：1 Blocker + 7 should-fix 修复）：用户端 `/i/[code]` 落地页（长度路由 + click + cookie + ch/c 校验）、注册回传（成功后清 cookie）、`dashboard/referrals`（分享 toast + 个人码二维码 + 漏斗）、`dashboard/coupons`（分区）；商家端 `/merchant/login` + `/merchant/redeem`（三态 + 面值 + 推广位）；后台 `/admin/campaigns`（活动 + 券包，面值元输入）、`/admin/merchants`（商家 + 账号 + 推广位 JSON）、`/admin/promotion`（看板 + 分页 + Shanghai 日期）+ 侧栏入口。
- 提交：M3+M4 `a3800cb`、ci.yml fix `42fbfd8`（需 workflow scope，由用户 push）、web 多 commit 至 `269f9c4`，均 push 到 `origin/feat/merchant-system`。
- 验证：api 单测 **446/446** + e2e + lint:api + web typecheck/lint 全绿；CI 绿。
- ci.yml：`api-tests` job 与 `.env.example` / `docker-compose.yml` 已补 `MERCHANT_JWT_SECRET`。

---

## 二、待办清单（需后续技术人员判断 / 实施）

### A. 需运行数据库（验证 + 收尾）
- [x] **已完成（2026-05-22）**：Docker Desktop 的 WSL Integration（Ubuntu 发行版）启用后，复用现有 `lilink-postgres`、建独立库 `lilink_merchant`（不碰主仓库 `lilink` 库）、配 dev 占位 `apps/api/.env`（DATABASE_URL 指 `lilink_merchant`）、`prisma migrate deploy` 全量 apply（含 M0 merchant 迁移 + partial unique index）。已用 psql 验证 8 张表 + partial index 定义 + User 5 个新列落库。
- [x] **已完成**：现有 e2e 全过（3 suites / 15 tests），确认 schema/代码改动无回归。
- [ ] 补 M1 邀请追踪 e2e：注册带个人码 → 生成 referralCode + 冻结归属 → `GET /me/referral` 漏斗；落地 `click` UV 去重 + bot 过滤；`share` 上报。（先 `npm run db:seed-defaults` 提供 school 域名）
- [ ] 存量数据回填迁移：为存量 user 生成 `referralCode`；从 `CycleParticipation.optedInAt` 最早值回填 `firstOptedInAt`。

> 注：dev 用 `apps/api/.env`（gitignored，占位密码非真实凭证）+ 独立库 `lilink_merchant`；主仓库的 `lilink` 库未受影响。

### B. M1 收尾（codex 标注的 should-fix，建议有 e2e 时做）
- [ ] **setParticipation 同事务**：`firstOptedInAt` 回填与 `cycleParticipation.upsert` 放同一 `$transaction`（当前非事务，后果可被下次 opt-in 自愈）。需重构 setParticipation + 其 20+ 单测的 prisma mock，并用 e2e 验证事务原子性（单测 mock 无法验证回滚）。
- [ ] 补 `firstOptedInAt` 行为单测（opt-in 写 / opt-out 不碰 / 重复 opt-in 命中 null guard）。
- [ ] **`deleteAllTestUsers`（`admin.service.ts`）同步更新**：物理删测试用户前先清理 `Redemption → Coupon → CampaignActivation`、解开 `referralCampaignId`/`referredByUserId`。**M2 发券前必须**，否则 `Restrict` 外键会挡住测试用户删除。

### C. M1 web（建议待 `ui-redesign` 合并后做，避免临时 UI 重复劳动）
- [ ] 落地页 `/i/[code]`：`trim+uppercase` 后按长度路由解析来源、调 `POST /referral/click` 记点击、把 `code/ch/c` 暂存 cookie/localStorage。
- [ ] 注册表单回传：读 cookie 把 `referralCode/channel/campaignSlug` 传入 `register`。
- [ ] `dashboard/referrals`：个人码 + 二维码、各渠道一键分享按钮（调 `POST /referral/events`）、我的邀请漏斗（调 `GET /me/referral`）。
- [ ] 与 `ui-redesign` 的新 UI 对齐（合同 §分支基线：当前 web 基于 main 旧 UI）。

### D. §A 优惠规则建模（合同明确：交后续技术人员设计）
- [ ] 选定档位（扁平字段 / 克制版本化 DSL / 完整引擎，合同 §待设计模块 A 有权衡）。
- [ ] 实现 `CouponRule` 类型 + `evaluateCoupon`/`renderBenefitText`/`requiresOrderAmount`/`validateCouponRule`（替换 M0 stub，保持签名稳定）。
- [ ] 后台券模板的优惠规则编辑器（替换 MVP 最简字段）。

### E. §B 核销消费额与求值（合同明确：交后续技术人员设计）
- [ ] 决定是否核销时输入消费额（合同 §待设计模块 B 有权衡：信任 vs 验证）。
- [ ] 启用时：`RedeemCouponDto.orderAmount`、核销事务内 `evaluateCoupon` 校验/计算、`Redemption.orderAmount/actualDiscountAmount` 落库、核销页金额输入。

### F. 后续里程碑（依赖前序，部分依赖 §A/§B）
- [x] **M2 优惠券 — api ✅**（见上「已完成」；待提交 + codex 审查）：活动 + 券包后台、`CampaignActivation` + 激活自动发券（ISSUED，幂等 `tryGrantCoupons`）、`GET /me/coupons` 已实现。**剩 web**：`dashboard/coupons`（用户券页）+ 后台活动/券包/商家管理页。
- [x] **M3 商家核销 ✅**（api + web 已实现，见上「已完成」）：商家与账号后台 + 推广位编辑、`MerchantGuard` + 商家登录、核销页 SQL 级三态 + 推广位。§B 核销消费额求值仍 stub（待 §E）。
- [x] **M4 数据看板 ✅**（api + web 已实现）：漏斗 / 排行榜（分性别分页）/ 券情况（按商家）/ 对账（按商家+天）。
- 注：web leaderboard 漏斗口径为 register 队列（注释说明，与「各步独立 count」边界微差）；referrals 二维码用外部 qrserver（生产可换 qrcode 库）；推广位编辑为 JSON textarea（MVP，可换可视化编辑器）。

### G. 其它待判断的小决策
- [ ] `visitorHash` 的 salt 当前复用 `JWT_SECRET`；是否要专用 env（如 `REFERRAL_VISITOR_SALT`）。
- [ ] `/referral/click` 防刷：**已做** = 专用 `referral-click-throttle`（1200/min）+ UV 去重 + bot/预抓取 UA 过滤（`isBotUserAgent`，空 UA 视为非真人）；**仍 TODO**：按 IP+code 维度分桶限频（更细粒度）。
- [ ] `AuthService` 的 `inviteCodeService`/`referralService` 是 TS 可选参数（非 Nest `@Optional()`），运行时靠模块 import 注入；可考虑加 `@Optional()` 以更明确。
- [ ] `getMyReferralOverview` 的 `granted` 口径 = 邀请的人中有 `CampaignActivation.couponsGrantedAt` 的 distinct user；M4 实现时与看板 §8 统一（建议改为按 distinct `Coupon` user 聚合）。
