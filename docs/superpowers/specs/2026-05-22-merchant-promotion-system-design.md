# 商家核销与推广系统 — 设计文档

- 日期：2026-05-22
- 分支：`feat/merchant-system`（基于 `main`）
- 状态：设计中（v4，已纳入三轮 Codex review；待用户确认）

## 修订记录

- **v4（纳入第三轮 Codex review）**：
  - **活动归属在注册时冻结**到 `User.referralCampaignId`（来源活动快照）：个人码、运营码、默认活动都写入该字段；`inviteCodeId`/`referredByUserId` 仅表示来源身份。注册→激活→领券→核销全程按此冻结归属，杜绝「注册计入 A、激活/核销计入 B」的跨活动错位。
  - 激活解析改为：有冻结来源活动则只用它（ACTIVE 才发券；ENDED/不存在则不发、**不 fallback、不改归属**）；无来源活动才取当前 active default 并**写回冻结**。
  - `User.referralCampaignId` 改 `Restrict`；**活动只软删除（ENDED）不硬删**，保留历史漏斗归属。
  - 补 Should-fix：M0 从 `CycleParticipation.optedInAt` 回填存量 `firstOptedInAt`；`firstOptedInAt` 与 participation upsert 同事务、条件写入、opt-out 不碰、`tryGrantCoupons` 事务后调用；`CouponTemplate.campaignId` 创建后不可改；漏斗「核销人数」count distinct user，与 §8「核销单数」口径分开。
  - **收尾（第四轮确认：无架构 Blocker，可进入实现计划）**：注册时若已有 active default 即冻结、个人码 `?c=` 仅接受有效可参与的 campaign（防篡改）、`ReferralEvent` 的 test 事件清理/排除、测试用户物理删除入口实际在 `admin.service.ts`、`CouponTemplate.campaignId` 不可改在 template 更新 service/DTO 层拒绝。
- **v3（纳入第二轮 review）**：新增 `User.firstOptedInAt` 稳定激活信号；删除 `Coupon.campaignId` 冗余；P2002 区分目标；`CampaignActivation.user` 改 Restrict；删 `perUserLimit`；运营码优先丢弃个人码 cookie；落地页 trim/uppercase + 长度路由；标注 `deleteAllTestUsers` 同步、`ReferralEvent` 弱引用。
- **v2（纳入第一轮 review）**：长度分命名空间；`CampaignActivation` 固化激活；发券幂等；砍 `totalQuota`；partial unique index；对账对象 Restrict + 软删除；核销下沉 SQL；抽 `humanCode`；补索引/鉴权/过期口径/看板限流。

## 1. 背景与目标

LiLink 已有一套**运营邀请码**系统（`InviteCode` 由后台手动创建、绑定推广人姓名 `ownerName`，用户注册时记录 `User.inviteCodeId`，统计按问卷性别实时派生）。本项目在其基础上构建**商家核销与推广系统**，覆盖四个功能：

1. **邀请追踪**：每个用户拥有专属邀请链接，可分享到微信渠道；新用户注册可追溯到「谁邀请的、走哪个渠道」。
2. **优惠券发放（激活奖励）**：用户完成「提交问卷 + 首次报名匹配周期」后，解锁一组商家券。
3. **商家核销**：商家网页登录后输入券短码核销，呈现「成功 / 已使用 / 无效」三态，一张券不可核销两次。
4. **数据看板（后台）**：拉新漏斗、邀请排行榜、券情况、商家核销明细对账。

### 设计目标
- 与现有 NestJS 模块化 + Prisma（cuid、单 schema 文件）+ Next.js App Router + `@lilink/shared` 约定一致。
- 复用现有资产：`AdminOperator` 账号模型（→ 商家账号）、`AdminGuard`（→ 商家 Guard）、短码生成器、`AuditLog`、`InviteCode`/`User.inviteCodeId`、问卷性别分桶逻辑。
- 数据精确到个人：任何新用户都能追溯邀请人与渠道；任何一张券都能反查所属用户、间接邀请人、领取时间。
- 后台看板清晰、整洁、可对账。

## 2. 已确认的关键决策

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 激活动作（解锁券触发） | **提交问卷（`submittedAt != null`）+ 曾经报名（`User.firstOptedInAt != null`）**，激活固化到 `CampaignActivation` |
| 2 | 个人邀请码模型 | **个人码 + 运营码并存**；长度分命名空间（个人码 10 位 / 运营码 8 位） |
| 3 | 商家核销鉴权 | **商家账号密码登录**（独立账号体系，天然支持「店员」维度） |
| 4 | 优惠券组织 | **活动（Campaign）+ 券包**，支持多活动；看板按活动维度 |

> **活动归属冻结（贯穿全局）**：用户的来源活动在**注册时一次性冻结**到 `User.referralCampaignId`，注册→激活→领券→核销全程按此归属，保证漏斗各步同活动一致；归属确定后不随运营码/活动变更而漂移。

## 3. 已固定的策略（v1 的开放问题已收敛为明确决策）

- **A. 分享渠道枚举**：`WECHAT_MOMENTS` / `WECHAT_GROUP` / `WECHAT_PRIVATE` / `COPY_LINK` / `QR` / `OTHER`。前端分享按钮把渠道写进链接 `?ch=`。
- **B. 微信分享追踪口径（现实约束）**：网页**无法**监听微信内「分享是否送达」。故「分享次数」= 用户点击分享/复制按钮次数（意图）；「链接点击」= 落地页访问 UV（去重）。看板明确标注口径。
- **C. 邀请链接结构**：`https://<web>/i/<code>?ch=<channel>&c=<campaignSlug>`。落地页 `/i/[code]` 解析前先 `trim + uppercase`，按 **code 长度路由**（8 位→运营码，10 位→个人码，其它长度直接 `INVALID`），记一次 CLICK 事件，并把 `code/ch/c` 暂存（cookie/localStorage），注册时回传。
- **D. 注册来源解析与活动冻结（固定）**：
  - 手填 `inviteCode`（运营码，8 位）：无效 → **抛错阻断注册**（保持现有 `resolveActiveCodeId` 行为）；有效 → 写 `inviteCodeId`，并把 `inviteCode.campaignId` **快照冻结**到 `referralCampaignId`。
  - `referralCode`（个人码，10 位，来自链接/cookie）：无效 → **忽略来源、放行注册**；有效 → 写 `referredByUserId/referralChannel`，并把链接 `?c=` 活动**冻结**到 `referralCampaignId`。
  - 同时出现时**优先手填 `inviteCode`**，并**丢弃个人码 cookie 及其活动**（避免个人来源活动抢占运营码活动）；二者择一写入来源身份。
  - 来源未绑定活动时：若存在 active default 则**注册时即冻结 default**，否则留空（由激活时再定）。个人码 `?c=` 仅接受存在且可参与（ACTIVE）的 campaign（防客户端篡改 `?c=`）。`referralCampaignId` 一旦确定，不再随运营码/活动变更而变。
- **E. 领券方式（默认，待确认）**：激活后券**自动发放**（`ISSUED`）。漏斗「领券」口径 = 该活动下已发券的用户（`CampaignActivation.couponsGrantedAt != null`）。备选：加 `CLAIMABLE/CLAIMED` 手动领取（见 §17-1）。
- **F. 店员管理**：MVP 由后台统一创建/管理商家与商家账号（含店员，`role` 区分 OWNER/STAFF）；核销记录关联具体操作账号 → 满足「哪个店员」。
- **G. 券面值口径**：模板配置名义面值 `faceValue`（分）用于对账。核销记录冗余 `faceValueSnapshot`。折扣券精确对账用可选 `orderAmount/actualDiscountAmount`（默认不填，见 §17-3）。
- **H. 短码格式与命名空间约束**：复用字母表（排除易混 `I/L/O/0/1`）。**个人码 10 位、运营码 8 位、券核销码 10 位**；个人码与运营码长度**永久不同**，落地页 / DTO 校验 / 生成器测试**共用同一组长度常量**（`INVITE_CODE_LENGTH=8`、`PERSONAL_CODE_LENGTH=10`）。配合商家登录鉴权 + 核销校验券归属，抗枚举。
- **I. 券过期口径（固定）**：有效性**动态计算** = `status == ISSUED && (expiresAt == null || expiresAt > now)`。可选 cron 把过期券落库为 `EXPIRED` 仅供统计；所有「有效券/可核销」判断按动态口径。

## 4. 架构总览

### 4.1 API 模块（`apps/api/src/modules/`）
- `referral/`：个人码生成、落地点击/分享事件、注册来源解析与活动冻结。
- `campaign/`：活动 CRUD、券包（券模板集合）配置（后台）。
- `coupon/`：券发放（激活触发）、用户查询自己的券。
- `activation/`（薄编排）：激活判定 + 写 `CampaignActivation` + 发券，幂等。
- `merchant/`：商家与商家账号管理（后台）、商家登录鉴权、核销。
- `promotion-dashboard/`：后台看板聚合查询。

### 4.2 共享包（`packages/shared/src/`）
- `referral.ts`：`ReferralChannel`、`ReferralSourceType`(PERSONAL/RECRUITER)。
- `coupon.ts`：`CouponBenefitType`、`CouponStatus`、有效性判断辅助。
- `merchant.ts`：`MerchantUserRole`、`RedemptionResult`(SUCCESS/ALREADY_USED/INVALID)。
- `campaign.ts`：`CampaignStatus`。
- `human-code.ts`：**公共短码生成器** `generateHumanCode({ length, alphabet })`；导出 `INVITE_CODE_LENGTH=8`、`PERSONAL_CODE_LENGTH=10`、`COUPON_CODE_LENGTH=10` 等常量供各处共用。

### 4.3 Web 区域（`apps/web/src/app/`）
- 用户端：`dashboard/referrals/`、`dashboard/coupons/`。
- 商家端（独立鉴权）：`merchant/login/`、`merchant/redeem/`。
- 后台：`admin/campaigns/`、`admin/merchants/`、`admin/promotion/`。现有 `admin/invite-codes/` 保留。

## 5. 数据模型（Prisma 扩展）

新增枚举：

```prisma
enum ReferralChannel   { WECHAT_MOMENTS WECHAT_GROUP WECHAT_PRIVATE COPY_LINK QR OTHER }
enum ReferralEventType { CLICK SHARE }
enum CampaignStatus    { DRAFT ACTIVE ENDED }
enum CouponBenefitType { FULL_REDUCTION DISCOUNT GIFT CUSTOM }
enum CouponStatus      { ISSUED REDEEMED EXPIRED VOID }
enum MerchantUserRole  { OWNER STAFF }
```

### 5.1 `User` / `InviteCode` 扩展 + 邀请事件

```prisma
// User 新增（均可选，向后兼容）
referralCode        String?          @unique           // 个人专属码，10 位
referredByUserId    String?                            // 来源身份：个人邀请人（自引用）
referredBy          User?            @relation("UserReferral", fields: [referredByUserId], references: [id], onDelete: SetNull)
referrals           User[]           @relation("UserReferral")
referralChannel     ReferralChannel?
referralCampaignId  String?                            // 冻结的来源活动快照（个人码/运营码/默认都写它）；归属唯一依据
referralCampaign    Campaign?        @relation("UserReferralCampaign", fields: [referralCampaignId], references: [id], onDelete: Restrict)
firstOptedInAt      DateTime?                          // 首次 opt-in 任意周期时回填；opt-out 不清空；稳定判定「曾经报名」
campaignActivations CampaignActivation[]
coupons             Coupon[]
// @@index([referredByUserId, createdAt])
// @@index([referralCampaignId, createdAt])
// 约束：referredByUserId != id（服务层校验）；inviteCodeId / referredByUserId 表来源身份，referralCampaignId 表归属活动。
```

```prisma
// InviteCode 新增
campaignId String?
campaign   Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
// @@index([campaignId])
// 注意：仅用于注册时取快照写入 User.referralCampaignId；激活不再动态读它。
```

```prisma
model ReferralEvent {                                   // 漏斗顶端两步；故意弱引用（不建外键），避免高频写入的外键检查与历史对象删除阻塞
  id             String            @id @default(cuid())
  type           ReferralEventType
  referrerUserId String?                                // 裸 id，无 relation
  inviteCodeId   String?                                // 裸 id，无 relation
  campaignId     String?                                // 裸 id，无 relation
  channel        ReferralChannel?
  dedupeKey      String?           @unique               // CLICK 去重：hash(code + day + visitorHash)
  visitorHash    String?                                // = hash(env_salt + ip + ua)，仅做 UV 去重，不存原始 ip/ua
  createdAt      DateTime          @default(now())

  @@index([referrerUserId, type, createdAt])
  @@index([campaignId, type, channel, createdAt])
  @@index([inviteCodeId, type, createdAt])
}
```

> SHARE 不去重（每次意图都记）；CLICK 按 `dedupeKey` UV 去重，并补每 IP 限频（§12）。

### 5.2 活动与券包（功能2/4）

```prisma
model Campaign {
  id              String           @id @default(cuid())
  name            String
  slug            String           @unique
  status          CampaignStatus   @default(DRAFT)
  startsAt        DateTime?
  endsAt          DateTime?
  description     String?
  isDefault       Boolean          @default(false)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  couponTemplates CouponTemplate[]
  inviteCodes     InviteCode[]
  referredUsers   User[]           @relation("UserReferralCampaign")
  activations     CampaignActivation[]
  @@index([status, startsAt])
}
// 迁移附加 raw SQL（Prisma 无法表达 partial unique index）：
// CREATE UNIQUE INDEX campaign_single_active_default
//   ON "Campaign" (("isDefault")) WHERE "isDefault" = true AND "status" = 'ACTIVE';
// 活动只软删除（status=ENDED），不提供硬删（User/Template/Activation 均 Restrict 引用）。
```

```prisma
model CouponTemplate {                                  // 「券包」= 某活动下 isActive 的模板集合
  id              String            @id @default(cuid())
  campaignId      String                                // 创建后不可变更（template 更新 service/DTO 层拒绝改此字段），防历史统计漂移
  campaign        Campaign          @relation(fields: [campaignId], references: [id], onDelete: Restrict)
  merchantId      String
  merchant        Merchant          @relation(fields: [merchantId], references: [id], onDelete: Restrict)
  title           String
  description     String?
  benefitType     CouponBenefitType
  amountOff       Int?                                  // FULL_REDUCTION：减免额（分）
  minSpend        Int?                                  // 满减门槛（分）
  percentOff      Int?                                  // DISCOUNT：折扣百分比
  giftDescription String?                               // GIFT：赠品描述
  customText      String?                               // CUSTOM：自定义文案
  faceValue       Int                                   // 名义面值（分），对账用
  validDays       Int?                                  // 相对有效期（领取后 N 天），与 validUntil 二选一
  validUntil      DateTime?
  isActive        Boolean           @default(true)      // 软删除/停用
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  coupons         Coupon[]
  @@index([campaignId, isActive])
  @@index([merchantId])
}
```

> 已砍 `totalQuota`（避免配额竞态）与 `perUserLimit`（与 `Coupon @@unique([userId, templateId])` 矛盾）。**MVP 语义：每模板每用户 1 张**。若日后需限量/多张，加 `issuedCount` 原子抢占并调整唯一约束。

### 5.3 激活记录与券实例（功能2/3）

```prisma
model CampaignActivation {                              // 稳定激活事件（只写一次）+ 发券幂等闸
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Restrict)  // 保护漏斗历史
  campaignId       String
  campaign         Campaign @relation(fields: [campaignId], references: [id], onDelete: Restrict)
  activatedAt      DateTime @default(now())
  couponsGrantedAt DateTime?                            // 发券完成时间；null=尚未发券
  createdAt        DateTime @default(now())
  @@unique([userId, campaignId])
  @@index([campaignId, activatedAt])
}
```

```prisma
model Coupon {
  id          String        @id @default(cuid())
  templateId  String
  template    CouponTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  userId      String
  user        User          @relation(fields: [userId], references: [id], onDelete: Restrict)  // 保护对账数据
  code        String        @unique                     // 核销短码（10 位）
  status      CouponStatus  @default(ISSUED)
  issuedAt    DateTime      @default(now())
  expiresAt   DateTime?
  redemption  Redemption?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  @@unique([userId, templateId])                        // 每用户每模板 1 张 → 并发发券幂等兜底
  @@index([userId, status])
  @@index([templateId, status])                         // 按活动统计：先取活动 templates，再按 templateId 聚合
  @@index([status, expiresAt])
}
```

> 活动归属统一走 `Coupon.template.campaignId`（不再冗余 `Coupon.campaignId`）。反查链路：`Coupon.userId` → 用户 → `referredByUserId`/`inviteCodeId` → 间接邀请人；`Coupon.template.merchantId` → 商家；`issuedAt` → 领取时间。

### 5.4 商家与核销（功能3）

```prisma
model Merchant {
  id          String          @id @default(cuid())
  name        String
  contactInfo String?
  isActive    Boolean         @default(true)            // 软删除/停用
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  users       MerchantUser[]
  templates   CouponTemplate[]
  redemptions Redemption[]
  @@index([isActive])
}

model MerchantUser {                                    // 商家登录账号（含店员），参考 AdminOperator
  id           String           @id @default(cuid())
  merchantId   String
  merchant     Merchant         @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  email        String           @unique
  passwordHash String                                   // argon2
  displayName  String?                                  // 店员名/工号
  role         MerchantUserRole @default(STAFF)
  isActive     Boolean          @default(true)
  lastLoginAt  DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt
  redemptions  Redemption[]
  @@index([merchantId, isActive])
}

model Redemption {
  id                   String        @id @default(cuid())
  couponId             String        @unique            // 一张券只能核销一次（DB 级保证）
  coupon               Coupon        @relation(fields: [couponId], references: [id], onDelete: Restrict)
  merchantId           String
  merchant             Merchant      @relation(fields: [merchantId], references: [id], onDelete: Restrict)
  merchantUserId       String?
  merchantUser         MerchantUser? @relation(fields: [merchantUserId], references: [id], onDelete: SetNull)
  userId               String                           // 冗余，便于明细查询
  faceValueSnapshot    Int                              // 面值快照，对账用
  orderAmount          Int?                             // 可选：实际消费额（精确对账）
  actualDiscountAmount Int?                             // 可选：实际减免额
  redeemedAt           DateTime      @default(now())
  createdAt            DateTime      @default(now())
  @@index([merchantId, redeemedAt])
  @@index([userId])
}
```

## 6. 用户旅程与激活发券

### 6.1 注册时记录来源并冻结活动归属
- 落地页 `/i/[code]`：`trim + uppercase` 后按 **code 长度路由**（8→运营码 / 10→个人码 / 其它→`INVALID`），写 `ReferralEvent(CLICK)`，暂存来源。
- 注册扩展可选字段 `referralCode/channel/campaignSlug`（运营码沿用现有 `inviteCode`）：
  - 运营码：`resolveActiveCodeId` → `inviteCodeId`（无效抛错）；丢弃个人码 cookie；把 `inviteCode.campaignId` **快照冻结**到 `referralCampaignId`。
  - 个人码：解析 `referredByUserId`（校验有效、非自己）+ `referralChannel`；链接 `?c=` 仅接受**存在且可参与（ACTIVE）的 campaign**，否则视为无来源活动（防客户端篡改 `?c=`）；有效则**冻结**到 `referralCampaignId`，无效来源忽略放行。
  - 来源未绑定活动：若当前存在 active default → **注册时即冻结该 default** 到 `referralCampaignId`（归属尽早定档）；确无 default 才留空（由 §6.2 激活时取 default 写回，主要覆盖历史/null 数据）。
- 注册成功后生成 `referralCode`（`generateHumanCode({ length: PERSONAL_CODE_LENGTH })`，本表唯一即可）。
- 存量老用户：迁移脚本批量回填 `referralCode`，邀请页惰性兜底生成。

### 6.2 激活判定与发券（幂等、不阻断主流程）
`activation.tryGrantCoupons(userId)`：
1. 校验 `questionnaireResponse.submittedAt != null`。
2. 校验**曾经报名**：`User.firstOptedInAt != null`（首次 opt-in 回填、opt-out 不清空 → 稳定，不随退出漂移）。
3. **解析归属活动（用冻结值，不再动态读运营码活动）**：
   - `user.referralCampaignId` 非空 → 用它；仅当其 `ACTIVE` 才发券；`ENDED`/不存在 → **不发券、不 fallback、不改归属**（保留漏斗归属，等同「活动已结束不再新发」）。
   - `user.referralCampaignId` 为空 → 取当前唯一 active default，**写回 `user.referralCampaignId` 冻结**，并发券。
   - 仍无可用活动 → 不激活、不发券。
4. `upsert CampaignActivation(userId, campaignId)`（唯一约束 → 首次写 `activatedAt`）。若 `couponsGrantedAt != null` → 已发，返回。
5. 事务内：对该活动券包每个 `isActive` 模板 `create Coupon`（按 `validDays/validUntil` 算 `expiresAt`，`code` 用 `generateHumanCode`）；置 `couponsGrantedAt = now()`。捕获 `P2002` **区分目标**：`[userId, templateId]` 冲突 → 该模板已发，跳过（幂等）；`code` 唯一冲突 → 重试生成短码（不可吞掉）。
6. 写 `AuditLog`（`actorId = null`、`action = 'coupon.grant'`、`metadata = { userId, campaignId, couponIds }`）。
- 触发点：问卷提交 service、首次 opt-in service，**两处都调用** `tryGrantCoupons`，幂等兜底。`User.firstOptedInAt` 与 participation upsert **同事务、条件写入**（仅当为空才写、opt-out 不碰）；`tryGrantCoupons` 在事务**提交后**调用、try/catch 包裹，**失败不阻断主流程**，记录失败 + 告警，下次触发点或手动补发。

## 7. 邀请追踪与漏斗口径（功能1 + 功能4）

漏斗六步（按活动维度=`User.referralCampaignId`，可细分性别 男/女/非二元，复用问卷性别分桶）：

| 步骤 | 数据来源 | 口径 |
|------|----------|------|
| 分享 | `ReferralEvent(SHARE)` count | 分享按钮点击次数（意图） |
| 点击 | `ReferralEvent(CLICK)` UV（`dedupeKey` 去重） | 落地页访问 UV |
| 注册 | `User`（`referralCampaignId`=该活动；`isTest=false`） | 注册人数 |
| 激活 | `CampaignActivation`（该活动） | 激活人数（稳定，不随 opt-out 变） |
| 领券 | `CampaignActivation.couponsGrantedAt != null`（该活动） | 已发券人数 |
| 核销 | 该活动激活用户中存在 `Redemption`（`Redemption→coupon→template`），**count distinct user** | 到店核销人数 |

**邀请排行榜**：按 `referrerUserId`（个人码）与 `inviteCodeId`（运营码）两类来源分别聚合，每个邀请人/码统计「拉来人数 + 各漏斗步人数，分性别」。抽公共聚合工具（扩展现有 `computeStats` 思路）。

## 8. 数据看板（功能4）

后台 `admin/promotion/`，按活动 + **必选时间范围**筛选：
- **拉新漏斗**：六步人数 + 相邻转化率；可切性别维度。
- **邀请排行榜**：个人码 / 运营码两榜，各步人数（分性别）；**分页**。
- **券情况**：按商家分组，发放 / 领取 / **核销单数**（按券计，与漏斗「核销人数」count distinct user **口径不同、不可混用**）；按活动筛选走 `template.campaignId` → 取 templates → 聚合 Coupon/Redemption。
- **商家核销明细（对账）**：按商家 + 按天，核销单数 + `sum(faceValueSnapshot)`。

聚合策略：MVP 实时聚合（限时间范围 + 分页），`isTest` 一律排除。**预留** `DailyCampaignStat`（按活动+天汇总表，cron 落库）以便数据增长后切换。

## 9. 鉴权与环境变量

- 三套会话**完全隔离**：用户（现有）、后台 `AdminGuard`（现有）、商家 `MerchantGuard`（新增，参考 `admin.guard.ts`）。
- 商家端 env：`MERCHANT_JWT_SECRET`、`MERCHANT_COOKIE_NAME`、会话 TTL；登录失败**限流**（防爆破）。
- Web 中间件/代理 matcher 覆盖 `/merchant` 区域；商家 cookie 名与 user/admin 不同。
- `MerchantGuard`：验 cookie JWT → 查 `MerchantUser.isActive && merchant.isActive` → 注入 `request.merchant`。停用即拒。

## 10. 核销实现（SQL 级三态）

商家 `POST /merchant/redeem { code }`，在事务内：
1. 条件 `updateMany`：`Coupon where { code, status: ISSUED, (expiresAt == null || > now), template.merchantId == 当前商家 }` → `status: REDEEMED`。
2. 影响 1 行 → 成功，`create Redemption`（含 `faceValueSnapshot`、`merchantUserId`、`userId`）。返回 `SUCCESS`。
3. 影响 0 行 → 查 `code` 实际状态：
   - 存在、属本商家、`REDEEMED` → `ALREADY_USED`。
   - 存在、属本商家、已过期 → `INVALID`（文案提示「已过期」）。
   - 不存在 / 跨商家 → `INVALID`（**不泄露券是否存在**）。
- `Redemption.couponId @unique` + 事务保证不被核销两次；并发只有一方更新成功。

## 11. API 端点清单（均含 DTO + class-validator）

- 用户端（JWT）：`GET /me/referral`、`POST /referral/events`(SHARE 上报)、`GET /me/coupons`。
- 公共：`GET /i/:code`(Web 落地) + `POST /referral/click`(CLICK，UV 去重 + IP 限频)。
- 商家端（MerchantGuard）：`POST /merchant/auth/login|logout`、`GET /merchant/auth/me`、`POST /merchant/redeem`。
- 后台（AdminGuard）：`campaigns` CRUD + `campaigns/:id/templates` CRUD；`merchants` CRUD + `merchants/:id/users` CRUD（含重置密码、停用）；`promotion/funnel|leaderboard|coupons|redemptions`（活动/日期筛选）。

## 12. 安全与防作弊

- 一券一核销：`Redemption.couponId @unique` + 事务条件更新。
- 跨商家核销：核销校验 `template.merchantId == 操作商家`，否则 `INVALID`。
- 自邀请：`referredByUserId != userId` 服务层校验。
- 激活/发券判定全在服务端；`isTest` 全程排除统计。
- 券码 10 位随机 + 商家登录鉴权；核销失败不泄露券归属。
- 点击 UV 去重 + 每 IP 限频；分享可选每用户限频。
- 商家密码 argon2；商家登录限流；三套 cookie/secret 隔离。
- 审计：核销以 `Redemption` 为主；后台操作用 `adminActorId`；发券系统动作 `actorId=null` + metadata；`AuditLog` 结构不变，merchant 维度存 metadata。

## 13. 测试策略

- 单元（Jest，`*.spec.ts`）：个人码/运营码长度路由无碰撞、自邀请防护、来源解析与活动冻结（运营码优先丢弃个人码 cookie、`referralCampaignId` 冻结后不漂移）；激活发券幂等（重复触发/两触发点并发只发一次、P2002 区分 code 冲突重试）；`firstOptedInAt` 在 opt-in/opt-out 序列下稳定；活动归属解析（冻结 ACTIVE/ENDED/空→default 写回）；核销三态 + 跨商家 + 过期 + 并发；漏斗/排行榜聚合（性别分桶、isTest 排除、核销 distinct user）。
- e2e（`test/jest-e2e.json`，需 DB）：注册带个人码 → 激活 → 发券 → 商家登录 → 核销 全链路。
- Web：typecheck + lint + `next build`（本工作树为平级目录，不受 `.claude/worktrees` Turbopack 限制）。

## 14. 里程碑 / 分期（每个里程碑各自一份实现计划）

- **M0 数据模型**：Prisma 扩展 + 迁移（含 partial unique index）+ `@lilink/shared` 枚举与长度常量 + `humanCode` 工具 + invite-code 重构复用 + 更新 `deleteAllTestUsers` + 回填存量 `referralCode`/`firstOptedInAt`。
- **M1 邀请追踪（功能1）**：个人码生成/回填、落地页 + 点击事件、注册来源记录与活动冻结、`firstOptedInAt` 回填、分享上报、`dashboard/referrals`。
- **M2 优惠券（功能2）**：活动 + 券包后台、`CampaignActivation` + 激活发券编排、`dashboard/coupons`。
- **M3 商家核销（功能3）**：商家与账号后台、`MerchantGuard` + 登录、核销页与三态。
- **M4 数据看板（功能4）**：漏斗 / 排行榜 / 券情况 / 核销明细。
- 依赖：M0 → M1 → M2 → M3 → M4。

## 15. 对现有系统的改动点（最小化）

- `User` 加 6 字段（referralCode、referredByUserId、referralChannel、referralCampaignId、firstOptedInAt 及关系）+ `InviteCode` 加 `campaignId`，均可选、向后兼容，不影响现有 `computeStats`。
- 注册流程加个人码来源分支 + 活动冻结，保留运营码分支与无效抛错行为。
- 抽 `generateHumanCode` 公共工具，`InviteCodeService` 改调用它（**保留现有单测语义**：长度 8、同 alphabet、`resolveActiveCodeId` 的 trim/uppercase、审计 metadata 不泄露码值）。
- `setParticipation` 的 opt-in 分支**同事务、条件回填** `User.firstOptedInAt`（仅当为空才写、opt-out 不碰）；`tryGrantCoupons` 在事务提交后调用。M0 迁移从现有 `CycleParticipation.optedInAt` 最早值回填存量 `firstOptedInAt`。
- 问卷提交、首次 opt-in 两处末尾调用 `tryGrantCoupons`（不阻断主流程）。
- **删除策略调整**：有券/核销/激活/来源归属的用户、被引用的活动/模板/商家改 `Restrict` + 软删除。**因此测试用户物理删除流程（`admin.service.ts` 的 `deleteAllTestUsers`）必须同步更新**：删用户前先按 `userId` 依次清理 `Redemption → Coupon → CampaignActivation`，并解开 `referralCampaignId`/`referredByUserId` 引用，否则被外键挡住。`ReferralEvent` 为弱引用（不挡删除），但 test referrer 产生的分享/点击事件应在清理时一并删除，或在统计聚合时排除。
- 现有 `admin/invite-codes` 页保留不变；新看板独立新增。

## 16. 边界与口径

- **活动结束（ENDED）**：不再新发券；已发券可继续核销至 `expiresAt`；用户归属不变（漏斗保留）。
- **活动删除**：活动**只软删除（status=ENDED）不硬删**（`User.referralCampaignId`、`CouponTemplate`、`CampaignActivation` 均 `Restrict`），保留历史漏斗归属。
- **商家/店员停用**：`isActive=false` 后不能登录核销；商家停用则该商家所有核销停止。
- **SUSPENDED 用户**：仍计入「注册」；其券是否可核销见 §17-2（默认可核销）。
- **test 用户**：全程排除统计；物理清理见 §15。
- **多/无默认活动**：partial unique index 保证至多一个 active default；无默认且无来源活动 → 用户不进任何活动漏斗、不发券。

## 17. 待用户确认的开放问题（其余已在 §3 固定）

1. **领券是否需要用户手动「领取」**？默认自动发放（§3-E）。若要让「激活→领券」漏斗有真实动作差异，加 `CLAIMABLE/CLAIMED` 状态 + 领取交互。
2. **用户注销 / SUSPENDED 的财务口径**？默认：有券/核销的用户不可物理删除（`Restrict`），注销走匿名化；SUSPENDED 用户已发券仍可核销。是否要更严格（封号即冻结券）？
3. **折扣券对账口径**？默认按名义 `faceValue` 对账；若要精确，核销时录入 `orderAmount` 并算 `actualDiscountAmount`。

## 18. 分支基线说明

本分支从 `main` 开出。当前 `ui-redesign` 的 UI 改版尚未并入 `main`，故 web 页面基于 `main` 现有 UI 组件；若 `ui-redesign` 合入需做一次 UI 对齐（已知、可控的后续工作）。
