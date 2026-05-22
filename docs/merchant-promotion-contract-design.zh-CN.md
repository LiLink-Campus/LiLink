# 商家核销与推广系统：合同与设计

本文档定义在现有运营邀请码系统之上、可直接落地实现的「商家核销与推广」合同，覆盖邀请追踪、激活奖励优惠券、商家网页核销、后台数据看板四块。

## 目标

- 每个用户拥有专属邀请链接，可分享到微信渠道；任何新用户都能追溯到「谁邀请的、走哪个渠道、属于哪次活动」。
- 优惠券只发给真正使用平台的用户：完成「提交问卷 + 首次报名匹配周期」激活后才解锁，用户手动领取后才可用。
- 商家用网页账号登录核销，30 秒上手、单次操作 10 秒内；一张券不可核销两次，三态结果明确。
- 后台一处看到每次活动的拉新漏斗、邀请排行榜、券情况、商家核销对账。
- 与现有约定一致：NestJS 模块化、Prisma（cuid、单 schema 文件）、Next.js App Router、`@lilink/shared`；复用 `AdminOperator`/`AdminGuard` 范式、短码生成、`AuditLog`、问卷性别分桶。
- 不破坏现有运营邀请码（`InviteCode` + `User.inviteCodeId` + `computeStats`），增量扩展。

## 当前产品决策

- **激活动作**：用户 `QuestionnaireResponse.submittedAt != null`（完善资料）且 `User.firstOptedInAt != null`（曾经报名匹配周期）后视为激活。`firstOptedInAt` 在首次 opt-in 时回填、opt-out 不清空，是稳定信号；激活固化为 `CampaignActivation`。
- **个人码 + 运营码并存**：每个用户注册后获得个人码（`User.referralCode`，10 位）；保留现有运营码（`InviteCode.code`，8 位）给线下推广人。两者**长度不同以分隔命名空间**，落地页按长度路由，永不碰撞。
- **活动归属注册时冻结**：用户来源活动在注册时一次性写入 `User.referralCampaignId`（个人码、运营码、默认活动都写它）。`inviteCodeId` / `referredByUserId` 仅表示来源身份。注册→激活→领券→核销全程按此冻结归属，不随运营码或活动变更而漂移。
- **优惠券手动领取**：激活后系统按活动券包为用户创建 `CLAIMABLE` 券；用户在「我的优惠券」主动领取后券变 `ISSUED`，此时才计算有效期。漏斗「领券」步以用户领取动作（`Coupon.claimedAt`）为准。
- **每模板每用户 1 张**：由 `Coupon @@unique([userId, templateId])` 保证；不设 `totalQuota`/`perUserLimit`（避免配额竞态）。
- **商家账号密码登录核销**：独立 `MerchantUser` 账号体系（含店员，`role` 区分 OWNER/STAFF），独立 `MerchantGuard` 与 cookie/secret，与 user/admin 会话隔离。
- **仅 ACTIVE 用户的券可核销**：核销时校验持券用户 `status == ACTIVE`；SUSPENDED/PENDING 用户的券一律 `INVALID`。
- **核销三态**：`SUCCESS` / `ALREADY_USED` / `INVALID`。跨商家、过期、未领取、用户非 ACTIVE、不存在一律返回 `INVALID`，不泄露券是否存在。
- **券面值对账按名义面值**：模板配置 `faceValue`（分）；核销快照 `faceValueSnapshot`。折扣券亦按名义面值对账，可选 `orderAmount`/`actualDiscountAmount` 默认不填。
- **优惠内容可自定义**：`CouponBenefitType` = 满减 / 折扣 / 赠品 / 自定义，配相应字段。
- **券有效性动态计算**：`status == ISSUED && (expiresAt == null || expiresAt > now) && user.status == ACTIVE`。可选 cron 把过期券落库为 `EXPIRED` 仅供统计。
- **活动只软删除**：活动生命周期用 `status`（DRAFT/ACTIVE/ENDED），不提供硬删；商家、券模板用 `isActive` 软删除。对账相关对象（券、核销、激活、来源归属）一律 `Restrict`，保护历史数据。
- **微信分享追踪口径**：网页无法监听微信内分享是否送达。「分享次数」= 用户点击分享/复制按钮次数（意图）；「链接点击」= 落地页访问 UV。
- **测试账号**：`isTest = true` 用户全程排除统计；物理清理见数据不变量与里程碑 M0。

## 术语

- 运营码：后台手动创建、绑定推广人姓名的邀请码（现有 `InviteCode`，8 位）。
- 个人码：用户注册后获得的专属邀请码（`User.referralCode`，10 位）。
- 来源身份：把新用户带进来的主体——个人邀请人（`referredByUserId`）或运营码（`inviteCodeId`）。
- 来源活动 / 归属活动：用户在注册时冻结的活动（`referralCampaignId`），是漏斗与发券归属的唯一依据。
- 活动（Campaign）：一次推广活动，含时间窗、券包、参与商家、独立漏斗。
- 券包：某活动下所有 `isActive` 的券模板集合。
- 券模板（CouponTemplate）：一种券的定义（商家、优惠内容、面值、有效期）。
- 券（Coupon）：发给某用户的券实例，带唯一核销码。
- 激活：用户完成「问卷提交 + 曾经报名」，固化为 `CampaignActivation`。
- 领取：用户把 `CLAIMABLE` 券领为 `ISSUED`（可用）的主动动作。
- 核销：商家在网页输入券码，将 `ISSUED` 券置 `REDEEMED` 并写 `Redemption`。
- 漏斗：分享 → 点击 → 注册 → 激活 → 领券 → 核销，六步按活动维度统计。

## 数据模型

### Prisma 枚举

```prisma
enum ReferralChannel   { WECHAT_MOMENTS WECHAT_GROUP WECHAT_PRIVATE COPY_LINK QR OTHER }
enum ReferralEventType { CLICK SHARE }
enum CampaignStatus    { DRAFT ACTIVE ENDED }
enum CouponBenefitType { FULL_REDUCTION DISCOUNT GIFT CUSTOM }
enum CouponStatus      { CLAIMABLE ISSUED REDEEMED EXPIRED VOID }
enum MerchantUserRole  { OWNER STAFF }
```

### Prisma 模型

现有 `User` / `InviteCode` 的扩展字段（其余现有字段不动）：

```prisma
// User 扩展（均可选，向后兼容；不影响现有 inviteCodeId 与 computeStats）
referralCode        String?          @unique           // 个人码，10 位
referredByUserId    String?                            // 来源身份：个人邀请人（自引用）
referredBy          User?            @relation("UserReferral", fields: [referredByUserId], references: [id], onDelete: SetNull)
referrals           User[]           @relation("UserReferral")
referralChannel     ReferralChannel?
referralCampaignId  String?                            // 冻结的来源/归属活动；归属唯一依据
referralCampaign    Campaign?        @relation("UserReferralCampaign", fields: [referralCampaignId], references: [id], onDelete: Restrict)
firstOptedInAt      DateTime?                          // 首次 opt-in 回填、opt-out 不清；稳定判定「曾经报名」
campaignActivations CampaignActivation[]
coupons             Coupon[]

@@index([referredByUserId, createdAt])
@@index([referralCampaignId, createdAt])
@@index([firstOptedInAt])

// InviteCode 扩展
campaignId String?
campaign   Campaign? @relation(fields: [campaignId], references: [id], onDelete: SetNull)
@@index([campaignId])
```

新增模型：

```prisma
model Campaign {
  id              String           @id @default(cuid())
  name            String
  slug            String           @unique             // 链接参数 ?c=
  status          CampaignStatus   @default(DRAFT)
  isDefault       Boolean          @default(false)     // 无来源活动时的兜底；至多一个 ACTIVE default（partial unique index）
  startsAt        DateTime?
  endsAt          DateTime?
  description     String?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  couponTemplates CouponTemplate[]
  inviteCodes     InviteCode[]
  referredUsers   User[]           @relation("UserReferralCampaign")
  activations     CampaignActivation[]

  @@index([status, startsAt])
}

model CouponTemplate {
  id              String            @id @default(cuid())
  campaignId      String                                // 创建后不可变更（template 更新 service/DTO 拒绝改此字段），防统计漂移
  campaign        Campaign          @relation(fields: [campaignId], references: [id], onDelete: Restrict)
  merchantId      String
  merchant        Merchant          @relation(fields: [merchantId], references: [id], onDelete: Restrict)
  title           String
  description     String?
  benefitType     CouponBenefitType
  amountOff       Int?                                  // FULL_REDUCTION：减免额（分）
  minSpend        Int?                                  // 满减门槛（分）
  percentOff      Int?                                  // DISCOUNT：折扣百分比 1..100
  giftDescription String?                               // GIFT：赠品描述
  customText      String?                               // CUSTOM：自定义文案
  faceValue       Int                                   // 名义面值（分），对账用
  validDays       Int?                                  // 领取后有效天数；与 validUntil 至多一个；两者均空 = 永不过期
  validUntil      DateTime?                             // 绝对有效期
  isActive        Boolean           @default(true)      // 软删除/停用
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  coupons         Coupon[]

  @@index([campaignId, isActive])
  @@index([merchantId])
}

model CampaignActivation {                              // 稳定激活事件（只写一次）+ 发券幂等闸
  id               String   @id @default(cuid())
  userId           String
  user             User     @relation(fields: [userId], references: [id], onDelete: Restrict)
  campaignId       String
  campaign         Campaign @relation(fields: [campaignId], references: [id], onDelete: Restrict)
  activatedAt      DateTime @default(now())
  couponsGrantedAt DateTime?                            // 系统创建 CLAIMABLE 券完成时间；null=尚未发放
  createdAt        DateTime @default(now())

  @@unique([userId, campaignId])
  @@index([campaignId, activatedAt])
}

model Coupon {
  id          String         @id @default(cuid())
  templateId  String
  template    CouponTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)
  userId      String
  user        User           @relation(fields: [userId], references: [id], onDelete: Restrict)  // 保护对账数据
  code        String         @unique                    // 核销短码，10 位
  status      CouponStatus   @default(CLAIMABLE)
  grantedAt   DateTime       @default(now())            // 激活发放（CLAIMABLE 创建）时间
  claimedAt   DateTime?                                 // 用户领取时间；置 ISSUED 时写入
  expiresAt   DateTime?                                 // 领取时按 validDays/validUntil 计算；CLAIMABLE 时为 null
  redemption  Redemption?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([userId, templateId])                        // 每用户每模板 1 张 → 并发发券幂等兜底
  @@index([userId, status])
  @@index([templateId, status])
  @@index([status, expiresAt])
}

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
  orderAmount          Int?                             // 可选：实际消费额
  actualDiscountAmount Int?                             // 可选：实际减免额
  redeemedAt           DateTime      @default(now())
  createdAt            DateTime      @default(now())

  @@index([merchantId, redeemedAt])
  @@index([userId])
}

model ReferralEvent {                                   // 漏斗顶端两步；故意弱引用（不建外键），避免高频写入外键检查与历史对象删除阻塞
  id             String            @id @default(cuid())
  type           ReferralEventType
  referrerUserId String?                                // 个人码场景，裸 id
  inviteCodeId   String?                                // 运营码场景，裸 id
  campaignId     String?                                // 裸 id
  channel        ReferralChannel?
  dedupeKey      String?           @unique               // CLICK 去重：hash(code + day + visitorHash)
  visitorHash    String?                                // = hash(env_salt + ip + ua)，仅做 UV 去重，不存原始 ip/ua
  createdAt      DateTime          @default(now())

  @@index([referrerUserId, type, createdAt])
  @@index([campaignId, type, channel, createdAt])
  @@index([inviteCodeId, type, createdAt])
}
```

说明：

- 给 `Campaign` 增加 `couponTemplates / inviteCodes / referredUsers / activations` 反向关系；给 `Merchant` 增加 `users / templates / redemptions`。
- 个人码 10 位、运营码 8 位长度永久不同，落地页 / DTO / 生成器测试共用 `@lilink/shared` 的长度常量；落地页解析前 `trim + uppercase`，非 8/10 位直接 `INVALID`。
- 活动归属统一走 `Coupon.template.campaignId`，**不在 `Coupon` 上冗余 `campaignId`**，避免与模板归属不一致。
- `Coupon` 状态流转：`CLAIMABLE`（激活发放）→ `ISSUED`（用户领取，计算 `expiresAt`）→ `REDEEMED`（核销）；`EXPIRED`（领取后过期）/ `VOID`（作废）为旁路终态。`grantedAt` 永远有值，`claimedAt` 仅在领取后有值。
- `ReferralEvent.SHARE` 不去重；`CLICK` 按 `dedupeKey` UV 去重。
- 原始 SQL 迁移保护（Prisma 无法表达部分索引）：

  ```sql
  CREATE UNIQUE INDEX campaign_single_active_default
    ON "Campaign" (("isDefault"))
    WHERE "isDefault" = true AND "status" = 'ACTIVE';
  ```

服务必须强制的数据不变量：

- `User.referralCampaignId` 一旦写入不再变更；它与 `inviteCodeId` / `referredByUserId` 的来源身份解耦。
- `referredByUserId != User.id`（禁止自邀请）。
- `firstOptedInAt` 只在首次 opt-in 时写入，opt-out 与后续 opt-in 都不得覆盖或清空。
- 同一 `(userId, campaignId)` 至多一条 `CampaignActivation`；发券以 `couponsGrantedAt` 是否为 null 作幂等闸。
- 同一 `(userId, templateId)` 至多一张 `Coupon`；并发发券撞 `@@unique` 视为已发；撞 `Coupon.code @unique` 必须重试生成短码，不可吞掉。
- `Coupon.expiresAt` 只在 `status` 从 `CLAIMABLE` 变 `ISSUED`（领取）时按模板 `validUntil`（绝对）或 `now + validDays`（相对）计算。
- `Redemption.couponId @unique`；核销在事务内以条件更新保证一张券只被核销一次。
- 至多一个 `status=ACTIVE && isDefault=true` 的 `Campaign`（partial unique index）。
- 有券 / 核销 / 激活 / 来源归属引用的用户、被引用的活动/模板/商家不可物理删除（`Restrict`）；测试用户物理删除流程（`admin.service.ts` 的 `deleteAllTestUsers`）必须先按 `userId` 清理 `Redemption → Coupon → CampaignActivation`、解开 `referralCampaignId` / `referredByUserId`，并删除或在统计中排除该 referrer 的 `ReferralEvent`。

## 共享类型常量

新增以下 `packages/shared/src` 模块，供 web 与 API 共享稳定枚举常量与纯 helper。

```ts
// referral.ts
export const REFERRAL_CHANNELS = [
  "WECHAT_MOMENTS", "WECHAT_GROUP", "WECHAT_PRIVATE", "COPY_LINK", "QR", "OTHER",
] as const;
export type ReferralChannel = (typeof REFERRAL_CHANNELS)[number];

export const REFERRAL_SOURCE_TYPES = ["PERSONAL", "RECRUITER"] as const;
export type ReferralSourceType = (typeof REFERRAL_SOURCE_TYPES)[number];

// human-code.ts —— 统一短码生成器与长度常量
export const HUMAN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 排除 I L O 0 1
export const INVITE_CODE_LENGTH = 8;     // 运营码（现有）
export const PERSONAL_CODE_LENGTH = 10;  // 个人码
export const COUPON_CODE_LENGTH = 10;    // 券核销码
export function generateHumanCode(opts: { length: number; alphabet?: string }): string;

// coupon.ts
export const COUPON_BENEFIT_TYPES = ["FULL_REDUCTION", "DISCOUNT", "GIFT", "CUSTOM"] as const;
export type CouponBenefitType = (typeof COUPON_BENEFIT_TYPES)[number];

export const COUPON_STATUSES = ["CLAIMABLE", "ISSUED", "REDEEMED", "EXPIRED", "VOID"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

// 券是否可被核销（仅前两项为可用前置；用户 ACTIVE 由服务端核销时校验）
export function isCouponRedeemable(c: { status: CouponStatus; expiresAt: string | null }, now: Date): boolean;

// campaign.ts
export const CAMPAIGN_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// merchant.ts
export const MERCHANT_USER_ROLES = ["OWNER", "STAFF"] as const;
export type MerchantUserRole = (typeof MERCHANT_USER_ROLES)[number];

export const REDEMPTION_RESULTS = ["SUCCESS", "ALREADY_USED", "INVALID"] as const;
export type RedemptionResult = (typeof REDEMPTION_RESULTS)[number];
```

`generateHumanCode` 取代现有 `InviteCodeService` 私有 `generateCandidateCode`；重构后须保留现有 invite-code 单测语义：长度 8、同 alphabet、`resolveActiveCodeId` 的 trim/uppercase、审计 metadata 不泄露码值。

## API 模块

新增 `apps/api/src/modules` 下：`referral`、`campaign`、`coupon`、`activation`（可并入 coupon 的薄编排）、`merchant`、`promotion-dashboard`。全局 `ValidationPipe` 为 whitelist/forbid，所有被接受字段必须有 `class-validator` 装饰器。

### 路由

```txt
# 用户端（JwtAuthGuard）
GET  /me/referral                         # 我的个人码、各渠道分享链接、我的邀请漏斗概况
POST /referral/events                     # 上报分享按钮点击（SHARE）
GET  /me/coupons                          # 我的券（CLAIMABLE / ISSUED / REDEEMED / EXPIRED）
POST /me/coupons/:couponId/claim          # 领取一张 CLAIMABLE 券 → ISSUED

# 公共（无需登录）
GET  /i/:code                             # Web 落地页（按长度路由解析来源）
POST /referral/click                      # 记录落地页点击（CLICK，UV 去重 + IP 限频）

# 商家端（MerchantGuard）
POST /merchant/auth/login
POST /merchant/auth/logout
GET  /merchant/auth/me
POST /merchant/redeem                      # 输入券码核销 → 三态

# 后台（AdminGuard）
GET    /admin/campaigns
POST   /admin/campaigns
PATCH  /admin/campaigns/:id                # 改 status / isDefault / 时间窗（campaignId 不可改）
GET    /admin/campaigns/:id/templates
POST   /admin/campaigns/:id/templates
PATCH  /admin/coupon-templates/:id         # 改券内容 / isActive（不可改 campaignId）
GET    /admin/merchants
POST   /admin/merchants
PATCH  /admin/merchants/:id                # 改 isActive 等
GET    /admin/merchants/:id/users
POST   /admin/merchants/:id/users          # 建商家账号 / 店员
PATCH  /admin/merchant-users/:id           # 改 isActive / 重置密码
GET    /admin/promotion/funnel             # 拉新漏斗（活动 + 时间范围 + 性别维度）
GET    /admin/promotion/leaderboard        # 邀请排行榜（个人码 / 运营码两榜，分页）
GET    /admin/promotion/coupons            # 券情况（按商家分组）
GET    /admin/promotion/redemptions        # 商家核销明细（按商家 + 按天对账）
```

### 请求 DTO

```ts
import { Type } from "class-transformer";
import {
  IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional,
  IsString, Max, MaxLength, Min, ValidateNested,
} from "class-validator";

// 上报分享意图
export class CreateReferralEventDto {
  @IsIn(["WECHAT_MOMENTS", "WECHAT_GROUP", "WECHAT_PRIVATE", "COPY_LINK", "QR", "OTHER"])
  channel!: string;
}

// 落地点击（公共；服务端据 code 长度路由，visitorHash 由服务端从 ip/ua 计算，客户端不提交）
export class CreateReferralClickDto {
  @IsString() @IsNotEmpty() @MaxLength(16)
  code!: string;                       // 8 位运营码 / 10 位个人码；其它长度 → INVALID
  @IsOptional() @IsIn(["WECHAT_MOMENTS","WECHAT_GROUP","WECHAT_PRIVATE","COPY_LINK","QR","OTHER"])
  channel?: string;
  @IsOptional() @IsString() @MaxLength(64)
  campaignSlug?: string;               // ?c=；仅接受存在且 ACTIVE 的活动，否则视为无来源活动
}

// 商家登录
export class MerchantLoginDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password!: string;
}

// 商家核销
export class RedeemCouponDto {
  @IsString() @IsNotEmpty() @MaxLength(16) code!: string;
}

// 后台：活动
export class CreateCampaignDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) slug!: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class UpdateCampaignDto {
  @IsOptional() @IsIn(["DRAFT", "ACTIVE", "ENDED"]) status?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  // 无 campaignId 字段：归属不可改
}

// 后台：券模板（创建后 campaignId、merchantId 不可改）
export class CreateCouponTemplateDto {
  @IsString() @IsNotEmpty() merchantId!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(["FULL_REDUCTION", "DISCOUNT", "GIFT", "CUSTOM"]) benefitType!: string;
  @IsOptional() @IsInt() @Min(0) amountOff?: number;
  @IsOptional() @IsInt() @Min(0) minSpend?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) percentOff?: number;
  @IsOptional() @IsString() @MaxLength(120) giftDescription?: string;
  @IsOptional() @IsString() @MaxLength(200) customText?: string;
  @IsInt() @Min(0) faceValue!: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) validDays?: number;
  @IsOptional() @IsISO8601() validUntil?: string;
}

// 后台：商家与账号
export class CreateMerchantDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(200) contactInfo?: string;
}
export class CreateMerchantUserDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsIn(["OWNER", "STAFF"]) role!: string;
}

// 后台看板查询
export class PromotionQueryDto {
  @IsOptional() @IsString() campaignId?: string;
  @IsISO8601() from!: string;            // 必选时间范围
  @IsISO8601() to!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
```

校验：

- 注册扩展沿用现有注册 DTO，新增可选 `referralCode` / `channel` / `campaignSlug`（运营码沿用现有 `inviteCode`）。运营码无效抛错；个人码无效忽略放行；同时出现优先运营码并丢弃个人码 cookie 及其活动。
- `POST /me/coupons/:couponId/claim`：券必须属于当前用户、`status = CLAIMABLE`；其归属活动须 `ACTIVE`；置 `ISSUED`、写 `claimedAt = now`、按模板计算 `expiresAt`。重复领取（已 `ISSUED`）幂等返回当前券。
- `POST /referral/click`：`code` `trim + uppercase` 后按长度路由（8/10），其它长度返回 `INVALID`；`campaignSlug` 仅接受存在且 `ACTIVE` 的活动。
- 券模板：`benefitType` 与字段一致性由服务校验（FULL_REDUCTION 需 `amountOff`；DISCOUNT 需 `percentOff`；GIFT 需 `giftDescription`；CUSTOM 需 `customText`）。`validDays` 与 `validUntil` 至多一个。
- `PATCH /admin/coupon-templates/:id`：拒绝修改 `campaignId` / `merchantId`。
- 所有 mutating 路由在事务内执行；激活发券、领取、核销对状态使用 compare-and-set 条件更新，0 行影响返回冲突/三态错误。

### 响应 DTO

```ts
export class MyReferralResponseDto {
  referralCode!: string;
  links!: { channel: ReferralChannel; url: string }[];   // 各渠道带 ?ch= 的分享链接
  funnel!: {                                             // 我作为邀请人的概况
    invited!: number; registered!: number; activated!: number; claimed!: number; redeemed!: number;
  };
}

export class MyCouponResponseDto {
  id!: string;
  status!: CouponStatus;                  // CLAIMABLE / ISSUED / REDEEMED / EXPIRED / VOID
  code!: string | null;                   // 仅 ISSUED 起对用户展示核销码
  merchantName!: string;
  title!: string;
  benefitType!: CouponBenefitType;
  benefitText!: string;                   // 服务端拼好的可读优惠文案
  faceValue!: number;
  claimedAt!: string | null;
  expiresAt!: string | null;
  redeemedAt!: string | null;
}

export class RedeemResponseDto {
  result!: RedemptionResult;              // SUCCESS / ALREADY_USED / INVALID
  coupon!: {                              // 仅 SUCCESS 返回最小必要信息
    title: string; benefitText: string; faceValue: number; userDisplayName: string | null;
  } | null;
}

export class PromotionFunnelResponseDto {
  campaignId!: string;
  steps!: { key: "SHARE"|"CLICK"|"REGISTER"|"ACTIVATE"|"CLAIM"|"REDEEM"; count: number }[];
  byGender!: { gender: "男"|"女"|"非二元"|"unknown"; steps: { key: string; count: number }[] }[];
  conversions!: { from: string; to: string; rate: number }[];
}

export class PromotionLeaderboardRowDto {
  sourceType!: ReferralSourceType;        // PERSONAL / RECRUITER
  refLabel!: string;                      // 个人码用户显示名 / 运营码 ownerName
  invited!: number; registered!: number; activated!: number; claimed!: number; redeemed!: number;
  byGender!: { male: number; female: number; nonBinary: number; unknown: number };
}

export class PromotionCouponsRowDto {
  merchantId!: string; merchantName!: string;
  granted!: number;                       // CLAIMABLE 发放数
  claimed!: number;                       // 已领取数
  redeemed!: number;                      // 核销单数
}

export class PromotionRedemptionRowDto {
  merchantId!: string; merchantName!: string;
  day!: string;                           // YYYY-MM-DD（学校时区 Asia/Shanghai）
  count!: number;                         // 核销单数
  faceValueTotal!: number;                // sum(faceValueSnapshot)
}
```

响应规则：

- `RedeemResponseDto` 在非 `SUCCESS` 时 `coupon = null`，不泄露券归属。
- 漏斗「核销」步与排行榜 `redeemed` 为 **count distinct user**；`PromotionCouponsRowDto.redeemed` / `PromotionRedemptionRowDto.count` 为**核销单数**，两套口径不可混用。
- 看板均按 `campaignId` + 时间范围过滤，`isTest` 用户一律排除；排行榜分页。

## 用户旅程与激活发券

### 注册时记录来源并冻结活动归属

```txt
落地页 /i/[code]：trim + uppercase，按长度路由（8→运营码 / 10→个人码 / 其它→INVALID）
  写 ReferralEvent(CLICK)（UV 去重），暂存 code/ch/c 到 cookie

注册：
  运营码（inviteCode，手填，8 位）：
    resolveActiveCodeId → inviteCodeId（无效抛错）
    丢弃个人码 cookie
    referralCampaignId = inviteCode.campaignId 快照（resolveActiveCodeId 需扩展为返回 campaignId，或注册事务内重查 inviteCode）
  个人码（referralCode，链接/cookie，10 位）：
    解析 referredByUserId（有效、非自己）+ referralChannel（无效则忽略放行）
    ?c= 仅接受存在且 ACTIVE 的活动 → referralCampaignId
  无来源活动：
    若存在 ACTIVE default → referralCampaignId = default（注册时即冻结）
    否则留空（激活时再定）
  注册成功后生成 referralCode = generateHumanCode({ length: PERSONAL_CODE_LENGTH })
```

### 激活与发券（幂等、不阻断主流程）

```txt
activation.tryGrantCoupons(userId)：
Precondition:
  QuestionnaireResponse.submittedAt != null
  User.firstOptedInAt != null

Resolve campaign（用冻结值，不动态读运营码活动）:
  user.referralCampaignId 非空 → 用它；ACTIVE 才发券，ENDED/不存在则不发、不 fallback、不改归属
  user.referralCampaignId 为空 → 取当前 ACTIVE default，写回冻结
  仍无 → 不激活、不发券

Action（事务内）:
  upsert CampaignActivation(userId, campaignId)  // 唯一约束；首次写 activatedAt
  if couponsGrantedAt != null: return            // 幂等
  for each isActive template in 券包:
    create Coupon(status=CLAIMABLE, grantedAt=now, code=generateHumanCode)
    P2002 on [userId, templateId] → 视为已发，跳过
    P2002 on code → 重试生成短码
  couponsGrantedAt = now
  AuditLog(actorId=null, action='coupon.granted', metadata={ userId, campaignId, couponIds })

触发点：问卷提交 service、首次 opt-in service（同事务条件回填 User.firstOptedInAt），事务提交后调用 tryGrantCoupons，try/catch 包裹，失败不阻断主流程、记录告警、下次触发或手动补发。
```

### 用户领取

```txt
POST /me/coupons/:couponId/claim
Precondition:
  coupon.userId = currentUserId
  coupon.status = CLAIMABLE
  归属活动「可领取」：campaign.status = ACTIVE 且 now 在 [startsAt, endsAt] 时间窗内
    （endsAt 到期必须先把活动转 ENDED；ENDED 或越窗 → 不可领取错误）
  计算 expiresAt = template.validUntil ?? (validDays ? now + validDays : null)
  若 expiresAt != null 且 expiresAt <= now → 不可领取（不写 claimedAt），并把该 CLAIMABLE 券收敛为 EXPIRED
Action（事务内 compare-and-set status CLAIMABLE→ISSUED）:
  status = ISSUED
  claimedAt = now
  expiresAt = 上面计算值
  AuditLog(action='coupon.claimed', metadata={ couponId, userId })
并发/重复领取：CAS 影响 0 行后，按 (couponId, userId) 重读——
  已 ISSUED → 返回当前券（幂等）；终态 / 不属于本人 / 活动不可领 → 返回相应错误。
```

## 券状态机

```txt
CLAIMABLE -> ISSUED      // 用户领取
CLAIMABLE -> EXPIRED     // 可选：活动结束/超期未领取（cron 或读时收敛；MVP 可不做，CLAIMABLE 常驻直到活动结束后人工/批处理作废）
ISSUED    -> REDEEMED    // 商家核销
ISSUED    -> EXPIRED     // 领取后超过 expiresAt（动态判定；可选 cron 落库）
任意非终态 -> VOID        // 后台作废（含跨清理）
```

- 终态：`REDEEMED` / `EXPIRED` / `VOID`。终态券不可领取、不可核销。
- 「可用」（可核销）判定：`status == ISSUED && (expiresAt == null || expiresAt > now) && user.status == ACTIVE`。
- `CLAIMABLE` 券不展示核销码（`code` 在响应中对未领取券置 null），防止未领取即被核销。

## 核销流程（SQL 级三态）

```txt
POST /merchant/redeem { code }（MerchantGuard，merchantId 来自登录态）
事务内：
1. 条件 updateMany（Prisma relation filter）：
   Coupon where {
     code,
     status: ISSUED,
     OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
     template: { is: { merchantId: 当前商家 } },
     user:     { is: { status: 'ACTIVE' } },   // 仅 ACTIVE 用户的券可核销
   } → set status = REDEEMED
2. 影响 1 行：同事务内按 code 重读该已更新券及 template/user 快照（updateMany 仅返回 count）
   create Redemption(couponId, merchantId, merchantUserId=当前账号, userId, faceValueSnapshot=template.faceValue)
   AuditLog(action='coupon.redeemed', metadata={ couponId, merchantId, merchantUserId })
   return SUCCESS + 最小券信息
3. 影响 0 行 → 仅在「同商家 + 用户 ACTIVE + status=REDEEMED」时返回 ALREADY_USED；
   其余（跨商家 / 不存在 / 过期 / CLAIMABLE 未领取 / 用户非 ACTIVE）一律 INVALID，不泄露券是否存在。
```

- `Redemption.couponId @unique` + 事务条件更新保证一张券不被核销两次；并发只有一方更新成功，另一方 0 行 → `ALREADY_USED`。
- 商家登录失败限流；核销失败不返回券归属细节。

## 数据看板合同

后台 `admin/promotion`，按活动 + 必选时间范围筛选，`isTest` 排除。

漏斗六步口径：

| 步骤 | 数据来源 | 口径 |
|------|----------|------|
| 分享 SHARE | `ReferralEvent(SHARE)` count | 分享按钮点击次数（意图） |
| 点击 CLICK | `ReferralEvent(CLICK)` UV（`dedupeKey` 去重） | 落地页访问 UV |
| 注册 REGISTER | `User`（`referralCampaignId`=该活动；`isTest=false`） | 注册人数 |
| 激活 ACTIVATE | `CampaignActivation`（该活动） | 激活人数（稳定） |
| 领券 CLAIM | `Coupon.claimedAt != null` 的用户（该活动） | 领券人数（用户动作） |
| 核销 REDEEM | 该活动用户中存在 `Redemption`，count distinct user | 到店核销人数 |

- **邀请排行榜**：按 `referrerUserId`（个人码）与 `inviteCodeId`（运营码）两类来源分别聚合各步人数（分性别），分页。复用并扩展现有 `computeStats` 的性别分桶。
- **券情况**：按商家分组 `granted / claimed / redeemed`（按活动筛选走 `template.campaignId` → 取 templates → 聚合 Coupon/Redemption）。
- **核销明细对账**：按商家 + 按天（Asia/Shanghai）核销单数 + `sum(faceValueSnapshot)`。
- 聚合策略：MVP 实时聚合（限时间范围 + 分页）；预留 `DailyCampaignStat`（活动+天汇总，cron）以便数据增长后切换。

## Web UI 组件

### 用户端

路由：

```txt
/i/[code]                       # 邀请落地页（公共）
/dashboard/referrals            # 我的邀请
/dashboard/coupons              # 我的优惠券
```

- 邀请页：展示个人码与二维码、各渠道一键分享按钮（朋友圈/群/私聊/复制/二维码，各带 `?ch=`）、我的邀请漏斗概况（邀请/注册/激活/领券/核销）。点分享按钮调 `POST /referral/events`。
- 券页：分区展示「待领取（CLAIMABLE）」「可用（ISSUED，显示核销码 + 有效期 + 商家 + 优惠）」「已用/已过期」。待领取券有「领取」按钮调 claim；领取成功 toast `已领取`。

### 商家端（独立鉴权）

```txt
/merchant/login                 # 商家账号登录
/merchant/redeem                # 核销页
```

- 核销页：极简——大输入框（券码）+ 大「核销」按钮；结果区醒目三态（绿 `核销成功` / 黄 `券已使用` / 红 `券无效`），成功展示券标题、优惠、面值、用户名。30 秒上手、单次 10 秒内。错误 inline，不抢焦点。

### 后台

```txt
/admin/campaigns                # 活动 + 券包配置
/admin/merchants                # 商家与账号（含店员、重置密码、停用）
/admin/promotion                # 数据看板（漏斗 / 排行榜 / 券情况 / 核销明细）
```

- 沿用现有 admin 布局与 `fetchAdminApiServer` / 客户端组件模式；现有 `/admin/invite-codes` 保留不变。
- 看板顶部为活动选择 + 时间范围；四块分 Tab 或分区，清晰整洁、可导出对账明细。

### Toast 合同

只在主动操作成功后显示克制 toast：`已领取`、`分享链接已复制`、核销页 `核销成功`。被动状态变化、对方操作、校验失败、服务端错误不显示 toast（错误 inline）。

## 安全与访问控制

- 三套会话隔离：用户 `JwtAuthGuard`（现有）、后台 `AdminGuard`（现有）、商家 `MerchantGuard`（新增，参考 `admin.guard.ts`）。商家 env：`MERCHANT_JWT_SECRET`、`MERCHANT_COOKIE_NAME`、TTL；登录失败限流。
- `GET /me/coupons`、claim 只作用于当前用户的券；核销只允许登录商家、且券属于该商家模板。
- 核销校验持券用户 `status == ACTIVE`、券 `status == ISSUED` 未过期；跨商家、未领取、过期、非 ACTIVE 一律 `INVALID`，不泄露券存在性。
- `referralCampaignId` 注册后不可改；自邀请服务端拒绝；个人码 `?c=` 仅接受有效活动，防客户端篡改归属。
- 券码 10 位随机；落地页/核销输入 `trim + uppercase`，非法长度直接拒。
- `isTest` 全程排除统计；点击 UV 去重 + 每 IP 限频，分享可选每用户限频。
- 商家密码 argon2；停用账号/商家立即拒绝登录与核销。

## 审计事件

```txt
referral.personal_code_generated
campaign.created
campaign.updated
coupon_template.created
coupon_template.updated
coupon.granted          # 系统激活发放 CLAIMABLE（actorId=null）
coupon.claimed          # 用户领取
coupon.redeemed         # 商家核销（metadata 含 merchantId / merchantUserId）
coupon.voided
merchant.created
merchant.updated
merchant_user.created
merchant_user.updated   # 含重置密码 / 停用
```

元数据只含 ID，不含码值或 secret。后台操作记 `adminActorId`；用户操作记 `actorId`；系统发券 `actorId=null`；商家维度记入 metadata（`AuditLog` 结构不变）。

## 测试

API 单元测试：

- 个人码 10 位 / 运营码 8 位长度路由互不碰撞；落地页非 8/10 位 → `INVALID`。
- 注册来源解析与活动冻结：运营码优先并丢弃个人码 cookie；`?c=` 非 ACTIVE 视为无来源；无来源但有 default 时注册即冻结；`referralCampaignId` 冻结后不随活动变更漂移。
- 自邀请被拒。
- `firstOptedInAt` 在 opt-in→opt-out→opt-in 序列下只写一次、不被清空。
- 激活发券幂等：重复触发、两触发点并发只发一套；P2002 在 `[userId,templateId]` 视为已发、在 `code` 上重试。
- 归属活动 ENDED/不存在不发券、不 fallback、不改归属；空归属取 ACTIVE default 并写回。
- 领取：CLAIMABLE→ISSUED 写 `claimedAt`、按 `validDays`/`validUntil` 计 `expiresAt`；活动 ENDED 不可领取；重复领取幂等。
- 核销三态：ISSUED 且用户 ACTIVE → SUCCESS；REDEEMED → ALREADY_USED；过期 / CLAIMABLE 未领取 / 用户非 ACTIVE / 跨商家 / 不存在 → INVALID。
- 并发核销同一券只成功一次，另一方 ALREADY_USED。
- 漏斗各步与排行榜聚合：性别分桶、isTest 排除、核销 count distinct user；券情况/对账按单数。
- `deleteAllTestUsers` 在测试用户有券/核销/激活时，先清理关联再删除成功。

Web / 组件测试：

- 邀请页渲染个人码与各渠道分享链接，点分享上报 SHARE。
- 券页分区渲染 CLAIMABLE/ISSUED/REDEEMED；CLAIMABLE 不显示核销码、有领取按钮；领取后出现核销码与有效期。
- 商家核销页三态渲染正确、成功展示券信息、错误 inline 不抢焦点。
- 后台看板按活动 + 时间范围渲染漏斗/排行榜/券情况/对账，排行榜分页。
- Toast 只在领取成功、复制链接、核销成功出现。

## 里程碑

每个里程碑各出一份实现计划。依赖 M0 → M1 → M2 → M3 → M4。

- **M0 数据模型**：Prisma 扩展 + 迁移（含 partial unique index）+ `@lilink/shared` 枚举与长度常量 + `generateHumanCode` + invite-code 重构复用 + 更新 `deleteAllTestUsers` + 回填存量 `referralCode` / `firstOptedInAt`（从 `CycleParticipation.optedInAt` 最早值）。
- **M1 邀请追踪**：个人码生成/回填、落地页 + 点击事件、注册来源记录与活动冻结、`firstOptedInAt` 回填、分享上报、`/dashboard/referrals`。
- **M2 优惠券**：活动 + 券包后台、`CampaignActivation` + 激活发券（CLAIMABLE）、用户领取（ISSUED）、`/dashboard/coupons`。
- **M3 商家核销**：商家与账号后台、`MerchantGuard` + 登录、核销页与 SQL 级三态（含 ACTIVE 用户校验）。
- **M4 数据看板**：漏斗 / 排行榜 / 券情况 / 核销明细对账。

## 待定决策

- `CLAIMABLE` 券是否设领取截止（活动结束后是否批量作废为 `EXPIRED`/`VOID`）：MVP 可不做，由活动 `ENDED` 阻止领取即可；后续如需「领取截止」再加 cron 收敛。
- 过期 / 收敛方式：动态判定为准；是否加 cron 把 `EXPIRED` 落库供统计，留待实现时选择，一旦落库即终态。
- 折扣券精确对账：默认名义 `faceValue`；若需按实际消费对账，核销时录入 `orderAmount` / `actualDiscountAmount`。
- 商家自助管理店员 / 自助查看本店核销明细：MVP 仅后台管理 + 核销页，后续可扩展商家端。
