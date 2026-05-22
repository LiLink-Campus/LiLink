# 商家核销与推广系统：合同与设计

本文档定义在现有运营邀请码系统之上、可直接落地实现的「商家核销与推广」合同，覆盖邀请追踪、激活奖励优惠券、商家网页核销、后台数据看板四块。其中**优惠规则建模**与**核销消费额/优惠求值**两块标记为「待设计模块」，交由后续技术人员细化（见末尾章节），本合同为其预留位置、接口与权衡，不阻塞其余部分落地。

## 目标

- 每个用户拥有专属邀请链接，可分享到微信渠道；任何新用户都能追溯到「谁邀请的、走哪个渠道、属于哪次活动」。
- 优惠券只发给真正使用平台的用户：完成「提交问卷 + 首次报名匹配周期」激活后，系统自动发放可用券。
- 商家用网页账号登录核销，30 秒上手、单次操作快；一张券不可核销两次，三态结果明确；核销成功页可展示商家自定义推广物料。
- 后台一处看到每次活动的拉新漏斗、邀请排行榜、券情况、商家核销对账。
- 与现有约定一致：NestJS 模块化、Prisma（cuid、单 schema 文件）、Next.js App Router、`@lilink/shared`；复用 `AdminOperator`/`AdminGuard` 范式、短码生成、`AuditLog`、问卷性别分桶。
- 不破坏现有运营邀请码（`InviteCode` + `User.inviteCodeId` + `computeStats`），增量扩展。

## 当前产品决策

- **激活动作**：用户 `QuestionnaireResponse.submittedAt != null`（完善资料）且 `User.firstOptedInAt != null`（曾经报名匹配周期）后视为激活。`firstOptedInAt` 在首次 opt-in 时回填、opt-out 不清空，是稳定信号；激活固化为 `CampaignActivation`。
- **激活自动发可用券**：激活后系统按活动券包为用户创建 `ISSUED`（可用）券，有效期从发放时按模板计算。**不设手动领取步骤**（已从早期「手动领取」方案合并：激活动作本身已是足够强的真实用户信号，再加一次领取的过滤价值不大）。漏斗「领券」步以「持有已发放券的用户」为口径。
- **个人码 + 运营码并存**：每个用户注册后获得个人码（`User.referralCode`，10 位）；保留现有运营码（`InviteCode.code`，8 位）给线下推广人。两者**长度不同以分隔命名空间**，落地页按长度路由，永不碰撞。
- **活动归属注册时冻结**：用户来源活动在注册时一次性写入 `User.referralCampaignId`（个人码、运营码、默认活动都写它）。`inviteCodeId` / `referredByUserId` 仅表示来源身份。注册→激活→发券→核销全程按此冻结归属，不随运营码或活动变更而漂移。
- **每模板每用户 1 张**：由 `Coupon @@unique([userId, templateId])` 保证；不设 `totalQuota`/`perUserLimit`（避免配额竞态）。
- **商家账号密码登录核销**：独立 `MerchantUser` 账号体系（含店员，`role` 区分 OWNER/STAFF），独立 `MerchantGuard` 与 cookie/secret，与 user/admin 会话隔离。
- **仅 ACTIVE 用户的券可核销**：核销时校验持券用户 `status == ACTIVE`；SUSPENDED/PENDING 用户的券一律 `INVALID`。
- **核销三态**：`SUCCESS` / `ALREADY_USED` / `INVALID`。跨商家、过期、用户非 ACTIVE、不存在一律返回 `INVALID`，不泄露券是否存在。
- **核销成功页展示商家自定义推广**：`Merchant.promotionBlocks` 可配多块（文字/图片/二维码），核销成功时返回并渲染，做商家二次营销（公众号关注、电话）。
- **券面值对账按名义面值**：模板配置 `faceValue`（分），核销快照 `faceValueSnapshot`。这是对账锚点，独立于优惠规则建模。
- **券有效性动态计算**：`status == ISSUED && (expiresAt == null || expiresAt > now) && user.status == ACTIVE`。可选 cron 把过期券落库为 `EXPIRED` 仅供统计。
- **活动只软删除**：活动生命周期用 `status`（DRAFT/ACTIVE/ENDED），不提供硬删；商家、券模板用 `isActive` 软删除。对账相关对象（券、核销、激活、来源归属）一律 `Restrict`，保护历史数据。
- **微信分享追踪口径**：网页无法监听微信内分享是否送达。「分享次数」= 用户点击分享/复制按钮次数（意图）；「链接点击」= 落地页访问 UV（去重 + 过滤已知 bot/微信预抓取 UA），看板只展示 UV，不展示 raw click。
- **测试账号**：`isTest = true` 用户全程排除统计；物理清理见数据不变量与里程碑 M0。
- **⏸️ 待后续设计（不在本合同固化，见「待设计模块」）**：① 优惠规则建模（条件 / 组合 / DSL）；② 核销时是否输入消费额及优惠条件求值。两者已预留数据位与接口，本合同其余部分不依赖其最终形态。

## 术语

- 运营码：后台手动创建、绑定推广人姓名的邀请码（现有 `InviteCode`，8 位）。
- 个人码：用户注册后获得的专属邀请码（`User.referralCode`，10 位）。
- 来源身份：把新用户带进来的主体——个人邀请人（`referredByUserId`）或运营码（`inviteCodeId`）。
- 来源活动 / 归属活动：用户注册时冻结的活动（`referralCampaignId`），是漏斗与发券归属的唯一依据。
- 活动（Campaign）：一次推广活动，含时间窗、券包、参与商家、独立漏斗。
- 券包：某活动下所有 `isActive` 的券模板集合。
- 券模板（CouponTemplate）：一种券的定义（商家、优惠规则、名义面值、有效期）。
- 券（Coupon）：发给某用户的券实例，带唯一核销码。
- 激活：用户完成「问卷提交 + 曾经报名」，固化为 `CampaignActivation`，并触发自动发券。
- 核销：商家在网页输入券码，将 `ISSUED` 券置 `REDEEMED` 并写 `Redemption`。
- 优惠规则：券的条件与优惠内容定义（**建模待后续设计**，本合同存于 `CouponTemplate.rule`）。
- 商家推广位：商家自定义、在核销成功页展示的营销物料（`Merchant.promotionBlocks`）。
- 漏斗：分享 → 点击 → 注册 → 激活 → 领券 → 核销，六步按活动维度统计。

## 数据模型

### Prisma 枚举

```prisma
enum ReferralChannel   { WECHAT_MOMENTS WECHAT_GROUP WECHAT_PRIVATE COPY_LINK QR OTHER }
enum ReferralEventType { CLICK SHARE }
enum CampaignStatus    { DRAFT ACTIVE ENDED }
enum CouponBenefitType { FULL_REDUCTION DISCOUNT GIFT CUSTOM }   // 粗分类，用于列表展示与求值分支；细规则见 rule（待设计）
enum CouponStatus      { ISSUED REDEEMED EXPIRED VOID }          // 无 CLAIMABLE：激活即发 ISSUED
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
  isDefault       Boolean          @default(false)     // 无来源活动时兜底；至多一个 ACTIVE default（partial unique index）
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
  benefitType     CouponBenefitType                     // 粗分类（满减/折扣/赠品/自定义）
  // ⏸️ 优惠规则建模待设计（见「待设计模块 §A」）。rule 承载条件 + 优惠内容；
  //    MVP 可先存最简结构（如 { amountOff } / { percentOff } / { giftText }）。
  //    web/api 通过 @lilink/shared 的 evaluateCoupon / renderBenefitText / requiresOrderAmount 消费它。
  rule            Json?
  faceValue       Int                                   // 名义面值（分），对账锚点——已确认，独立于 rule
  validDays       Int?                                  // 发放后有效天数；与 validUntil 至多一个；两者均空 = 永不过期
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
  couponsGrantedAt DateTime?                            // 发券完成时间；null=尚未发券
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
  status      CouponStatus   @default(ISSUED)            // 激活即发 ISSUED（可用）
  issuedAt    DateTime       @default(now())             // 发放（=可用）时间
  expiresAt   DateTime?                                  // 发放时按 validUntil ?? now+validDays 计算；均空=永不过期
  redemption  Redemption?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([userId, templateId])                        // 每用户每模板 1 张 → 并发发券幂等兜底
  @@index([userId, status])
  @@index([templateId, status])
  @@index([status, expiresAt])
}

model Merchant {
  id              String          @id @default(cuid())
  name            String
  contactInfo     String?
  promotionBlocks Json?                                  // 核销成功页展示的自定义推广物料；见下「商家推广位」
  isActive        Boolean         @default(true)         // 软删除/停用
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  users           MerchantUser[]
  templates       CouponTemplate[]
  redemptions     Redemption[]

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
  faceValueSnapshot    Int                              // 名义面值快照，对账用
  orderAmount          Int?                             // ⏸️ 预留：实际消费额（待设计模块 §B 启用）
  actualDiscountAmount Int?                             // ⏸️ 预留：实际减免额（求值产出）
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

- 个人码 10 位、运营码 8 位长度永久不同，落地页 / DTO / 生成器测试共用 `@lilink/shared` 的长度常量；落地页解析前 `trim + uppercase`，非 8/10 位直接 `INVALID`。
- 活动归属统一走 `Coupon.template.campaignId`，**不在 `Coupon` 上冗余 `campaignId`**，避免不一致。
- `Coupon` 状态流转：`ISSUED`（激活发放即可用）→ `REDEEMED`（核销）；`EXPIRED`（过期）/ `VOID`（作废）为旁路终态。
- `Merchant.promotionBlocks` 与 `CouponTemplate.rule` 均为 `Json`：前者结构本合同已定（见「商家推广位」），后者结构待设计（见「待设计模块 §A」）。
- `ReferralEvent.SHARE` 不去重；`CLICK` 按 `dedupeKey` UV 去重。
- 原始 SQL 迁移保护（Prisma 无法表达部分索引）：

  ```sql
  CREATE UNIQUE INDEX campaign_single_active_default
    ON "Campaign" (("isDefault"))
    WHERE "isDefault" = true AND "status" = 'ACTIVE';
  ```

服务必须强制的数据不变量：

- `User.referralCampaignId` 一旦写入不再变更；与 `inviteCodeId` / `referredByUserId` 来源身份解耦。
- `referredByUserId != User.id`（禁止自邀请）。
- `firstOptedInAt` 只在首次 opt-in 时写入，opt-out 与后续 opt-in 都不得覆盖或清空。
- 同一 `(userId, campaignId)` 至多一条 `CampaignActivation`；发券以 `couponsGrantedAt` 是否为 null 作幂等闸。
- 同一 `(userId, templateId)` 至多一张 `Coupon`；并发发券撞 `@@unique` 视为已发；撞 `Coupon.code @unique` 必须重试生成短码，不可吞掉。
- `Coupon.expiresAt` 在发放（创建 `ISSUED`）时按模板 `validUntil`（绝对）或 `now + validDays`（相对）计算；两者均空 = 永不过期。
- `Redemption.couponId @unique`；核销在事务内以条件更新保证一张券只被核销一次。
- 至多一个 `status=ACTIVE && isDefault=true` 的 `Campaign`（partial unique index）。
- 有券 / 核销 / 激活 / 来源归属引用的用户、被引用的活动/模板/商家不可物理删除（`Restrict`）；测试用户物理删除流程（`admin.service.ts` 的 `deleteAllTestUsers`）必须先按 `userId` 清理 `Redemption → Coupon → CampaignActivation`、解开 `referralCampaignId` / `referredByUserId`，并删除或在统计中排除该 referrer 的 `ReferralEvent`。

### 商家推广位（promotionBlocks，结构已定）

```ts
// @lilink/shared merchant.ts
export type MerchantPromotionBlock =
  | { type: "TEXT"; text: string }
  | { type: "IMAGE"; imageUrl: string; caption?: string }
  | { type: "QRCODE"; imageUrl: string; caption?: string };   // 公众号/客服二维码
export type MerchantPromotion = MerchantPromotionBlock[];      // 顺序展示，建议上限 5 块
```

- 校验（`PromotionBlockDto`，`UpdateMerchantDto.promotionBlocks?: PromotionBlockDto[]`）：最多 5 块；`type ∈ {TEXT,IMAGE,QRCODE}`；`text`/`caption` ≤ 200 字；`imageUrl` 仅允许 `https:` scheme，禁止 `javascript:` / `data:`。
- 渲染：文本一律转义、图片用 `<img src>` 不内联 HTML；核销成功响应附 `merchantPromotion`，核销结果页按顺序渲染（二维码 + 文案 + 电话等）。

## 共享类型常量

新增 `packages/shared/src` 模块，供 web 与 API 共享。

```ts
// referral.ts
export const REFERRAL_CHANNELS = ["WECHAT_MOMENTS","WECHAT_GROUP","WECHAT_PRIVATE","COPY_LINK","QR","OTHER"] as const;
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
export const COUPON_BENEFIT_TYPES = ["FULL_REDUCTION","DISCOUNT","GIFT","CUSTOM"] as const;
export type CouponBenefitType = (typeof COUPON_BENEFIT_TYPES)[number];
export const COUPON_STATUSES = ["ISSUED","REDEEMED","EXPIRED","VOID"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];
// 券是否可被核销（用户 ACTIVE 由服务端核销时另校验）
export function isCouponRedeemable(c: { status: CouponStatus; expiresAt: string | null }, now: Date): boolean;

// ⏸️ 优惠规则细类型由「待设计模块 §A」补全。M0 即提供最简 stub：
//    export type CouponRule = Record<string, unknown>;   // §A 定稿后换 discriminated union
//    renderBenefitText / requiresOrderAmount / validateCouponRule / evaluateCoupon 先给兜底实现。
//    consumer（券页 benefitText、核销求值）一律走这些函数、不直接读 rule，便于 §A 平滑替换。

// campaign.ts
export const CAMPAIGN_STATUSES = ["DRAFT","ACTIVE","ENDED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

// merchant.ts（含上文 MerchantPromotion 类型）
export const MERCHANT_USER_ROLES = ["OWNER","STAFF"] as const;
export type MerchantUserRole = (typeof MERCHANT_USER_ROLES)[number];
export const REDEMPTION_RESULTS = ["SUCCESS","ALREADY_USED","INVALID"] as const;
export type RedemptionResult = (typeof REDEMPTION_RESULTS)[number];
```

`generateHumanCode` 取代现有 `InviteCodeService` 私有 `generateCandidateCode`；重构后须保留现有 invite-code 单测语义：长度 8、同 alphabet、`resolveActiveCodeId` 的 trim/uppercase、审计 metadata 不泄露码值。

## API 模块

新增 `apps/api/src/modules` 下：`referral`、`campaign`、`coupon`、`activation`（薄编排，可并入 coupon）、`merchant`、`promotion-dashboard`。全局 `ValidationPipe` 为 whitelist/forbid，所有被接受字段必须有 `class-validator` 装饰器。

### 路由

```txt
# 用户端（JwtAuthGuard）
GET  /me/referral                         # 我的个人码、各渠道分享链接、我的邀请漏斗概况
POST /referral/events                     # 上报分享按钮点击（SHARE）
GET  /me/coupons                          # 我的券（ISSUED / REDEEMED / EXPIRED）

# 公共（无需登录）
GET  /i/:code                             # Web 落地页（按长度路由解析来源）
POST /referral/click                      # 记录落地页点击（CLICK，UV 去重 + IP 限频）

# 商家端（MerchantGuard）
POST /merchant/auth/login
POST /merchant/auth/logout
GET  /merchant/auth/me
POST /merchant/redeem                      # 输入券码核销 → 三态（+ 商家推广位）

# 后台（AdminGuard）
GET    /admin/campaigns
POST   /admin/campaigns
PATCH  /admin/campaigns/:id                # 改 status / isDefault / 时间窗（campaignId 不可改）
GET    /admin/campaigns/:id/templates
POST   /admin/campaigns/:id/templates
PATCH  /admin/coupon-templates/:id         # 改券内容 / isActive（不可改 campaignId / merchantId）
GET    /admin/merchants
POST   /admin/merchants
PATCH  /admin/merchants/:id                # 改 isActive / contactInfo / promotionBlocks
GET    /admin/merchants/:id/users
POST   /admin/merchants/:id/users          # 建商家账号 / 店员
PATCH  /admin/merchant-users/:id           # 改 isActive / 重置密码
GET    /admin/promotion/funnel             # 拉新漏斗（活动 + 时间范围 + 性别维度）
GET    /admin/promotion/leaderboard        # 邀请排行榜（个人码 / 运营码两榜，分页）
GET    /admin/promotion/coupons            # 券情况（按商家分组）
GET    /admin/promotion/redemptions        # 商家核销明细（按商家 + 按天对账）
```

注：无 `claim` 端点——激活即发可用券；`/me/coupons` 直接返回可用券与核销码。

### 请求 DTO

```ts
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class CreateReferralEventDto {
  @IsIn(["WECHAT_MOMENTS","WECHAT_GROUP","WECHAT_PRIVATE","COPY_LINK","QR","OTHER"]) channel!: string;
}

export class CreateReferralClickDto {
  @IsString() @IsNotEmpty() @MaxLength(16) code!: string;     // 8 位运营码 / 10 位个人码；其它长度 → INVALID
  @IsOptional() @IsIn(["WECHAT_MOMENTS","WECHAT_GROUP","WECHAT_PRIVATE","COPY_LINK","QR","OTHER"]) channel?: string;
  @IsOptional() @IsString() @MaxLength(64) campaignSlug?: string;  // ?c=；仅接受存在且 ACTIVE 的活动
}

export class MerchantLoginDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password!: string;
}

export class RedeemCouponDto {
  @IsString() @IsNotEmpty() @MaxLength(16) code!: string;
  // ⏸️ 预留：orderAmount?（消费额）由「待设计模块 §B」启用；MVP 不接受该字段
}

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(64) slug!: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class UpdateCampaignDto {
  @IsOptional() @IsIn(["DRAFT","ACTIVE","ENDED"]) status?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

// 券模板：title/faceValue/有效期已定；优惠规则 rule 的校验 schema 待「待设计模块 §A」补全
export class CreateCouponTemplateDto {
  @IsString() @IsNotEmpty() merchantId!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsIn(["FULL_REDUCTION","DISCOUNT","GIFT","CUSTOM"]) benefitType!: string;
  @IsInt() @Min(0) faceValue!: number;
  @IsOptional() @IsInt() @Min(1) @Max(3650) validDays?: number;
  @IsOptional() @IsISO8601() validUntil?: string;
  @IsOptional() @IsObject() rule?: Record<string, unknown>;  // 优惠规则 payload；MVP 宽松接收 + service 调 validateCouponRule 按 benefitType 校验最简结构；§A 定稿后换强类型 DTO
}

export class CreateMerchantDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(200) contactInfo?: string;
}
export class PromotionBlockDto {
  @IsIn(["TEXT","IMAGE","QRCODE"]) type!: string;
  @IsOptional() @IsString() @MaxLength(200) text?: string;                                  // TEXT
  @IsOptional() @IsString() @MaxLength(200) caption?: string;                               // IMAGE/QRCODE
  @IsOptional() @IsUrl({ protocols: ["https"], require_protocol: true }) imageUrl?: string; // IMAGE/QRCODE，仅 https
}
export class UpdateMerchantDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) contactInfo?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => PromotionBlockDto)
  promotionBlocks?: PromotionBlockDto[];
}
export class CreateMerchantUserDto {
  @IsString() @IsNotEmpty() @MaxLength(254) email!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password!: string;
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsIn(["OWNER","STAFF"]) role!: string;
}

export class PromotionQueryDto {
  @IsOptional() @IsString() campaignId?: string;
  @IsISO8601() from!: string;
  @IsISO8601() to!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
```

校验：

- 注册扩展沿用现有注册 DTO，新增可选 `referralCode` / `channel` / `campaignSlug`（运营码沿用现有 `inviteCode`）。运营码无效抛错；个人码无效忽略放行；同时出现优先运营码并丢弃个人码 cookie 及其活动。
- `POST /referral/click`：`code` `trim + uppercase` 后按长度路由（8/10），其它长度 `INVALID`；`campaignSlug` 仅接受存在且 `ACTIVE` 的活动。
- 券模板：`benefitType` 与 `rule` 的一致性校验由「待设计模块 §A」定稿后补全；MVP 服务层按 `benefitType` 校验最简字段。`validDays` 与 `validUntil` 至多一个。
- `PATCH /admin/coupon-templates/:id`：拒绝修改 `campaignId` / `merchantId`。
- 所有 mutating 路由在事务内执行；激活发券、核销对状态使用 compare-and-set 条件更新。

### 响应 DTO

```ts
export class MyReferralResponseDto {
  referralCode!: string;
  links!: { channel: ReferralChannel; url: string }[];
  funnel!: { invited: number; registered: number; activated: number; granted: number; redeemed: number };
}

export class MyCouponResponseDto {
  id!: string;
  status!: CouponStatus;                  // effective status：ISSUED 但已过 expiresAt 一律按 EXPIRED 返回，券页分区据此稳定
  code!: string;                          // 核销码（激活即发，直接可见）
  merchantName!: string;
  title!: string;
  benefitType!: CouponBenefitType;
  benefitText!: string;                   // 由 renderBenefitText(rule) 生成（待设计前用最简兜底）
  faceValue!: number;
  issuedAt!: string;
  expiresAt!: string | null;
  redeemedAt!: string | null;
}

export class RedeemResponseDto {
  result!: RedemptionResult;              // SUCCESS / ALREADY_USED / INVALID
  coupon!: { title: string; benefitText: string; faceValue: number; userDisplayName: string | null } | null; // 仅 SUCCESS
  merchantPromotion!: MerchantPromotionBlock[] | null;   // 仅 SUCCESS，渲染商家推广位
}

export class PromotionFunnelResponseDto {
  campaignId!: string;
  steps!: { key: "SHARE"|"CLICK"|"REGISTER"|"ACTIVATE"|"GRANT"|"REDEEM"; count: number }[];
  byGender!: { gender: "男"|"女"|"非二元"|"unknown"; steps: { key: string; count: number }[] }[];
  conversions!: { from: string; to: string; rate: number }[];
}

export class PromotionLeaderboardRowDto {
  sourceType!: ReferralSourceType;
  refLabel!: string;                      // 个人码用户显示名 / 运营码 ownerName
  invited!: number; registered!: number; activated!: number; granted!: number; redeemed!: number;
  byGender!: { male: number; female: number; nonBinary: number; unknown: number };
}

export class PromotionCouponsRowDto {
  merchantId!: string; merchantName!: string;
  granted!: number;                       // 发放数
  redeemed!: number;                      // 核销单数
}

export class PromotionRedemptionRowDto {
  merchantId!: string; merchantName!: string;
  day!: string;                           // YYYY-MM-DD（Asia/Shanghai）
  count!: number;                         // 核销单数
  faceValueTotal!: number;                // sum(faceValueSnapshot)
}
```

响应规则：

- `RedeemResponseDto` 在非 `SUCCESS` 时 `coupon = null`、`merchantPromotion = null`，不泄露券归属。
- 漏斗「核销」步与排行榜 `redeemed` 为 **count distinct user**；`PromotionCouponsRowDto.redeemed` / `PromotionRedemptionRowDto.count` 为**核销单数**，两套口径不可混用。
- 看板均按 `campaignId` + 时间范围过滤，`isTest` 用户一律排除；排行榜分页。

## 用户旅程与激活发券

### 注册时记录来源并冻结活动归属

```txt
落地页 /i/[code]：trim + uppercase，按长度路由（8→运营码 / 10→个人码 / 其它→INVALID）
  写 ReferralEvent(CLICK)（UV 去重），暂存 code/ch/c 到 cookie

注册：
  运营码（inviteCode，手填，8 位）：
    resolveActiveCodeId → inviteCodeId（无效抛错；需扩展为返回 campaignId，或注册事务内重查 inviteCode）
    丢弃个人码 cookie
    referralCampaignId = inviteCode.campaignId 快照
  个人码（referralCode，链接/cookie，10 位）：
    解析 referredByUserId（有效、非自己）+ referralChannel（无效则忽略放行）
    ?c= 仅接受存在且 ACTIVE 的活动 → referralCampaignId
  无来源活动：
    若存在 ACTIVE default → referralCampaignId = default（注册时即冻结）
    否则留空（永久无归属：激活时不再补绑 default，避免漂移；含义见下「活动上线时机」）
  注册成功后生成 referralCode = generateHumanCode({ length: PERSONAL_CODE_LENGTH })
```

**活动上线时机**：归属只在注册时确定、激活不再补绑。因此**活动须在拉新前设为 `ACTIVE` 且 `isDefault`**，否则更早注册的用户无归属、激活不发券（他们不属于这次活动，符合预期）。一次活动的标准顺序：建活动 + 券包 → 置 ACTIVE default → 再推广拉新。

### 激活与发券（幂等、不阻断主流程）

```txt
activation.tryGrantCoupons(userId)：
Precondition:
  QuestionnaireResponse.submittedAt != null
  User.firstOptedInAt != null

Resolve campaign（仅用注册时冻结的归属，激活时不再 fallback）:
  user.referralCampaignId 非空 → 用它；ACTIVE 才发券，ENDED/不存在则不发、不改归属
  user.referralCampaignId 为空 → 不发券（注册时即不属于任何活动，归属不再补绑，避免漂移）

Action（事务内）:
  upsert CampaignActivation(userId, campaignId)  // 唯一约束；首次写 activatedAt
  if couponsGrantedAt != null: return            // 幂等
  for each isActive template in 券包:
    create Coupon(status=ISSUED, issuedAt=now, expiresAt=validUntil ?? (validDays ? now+validDays : null), code=generateHumanCode)
    P2002 on [userId, templateId] → 视为已发，跳过
    P2002 on code → 重试生成短码
  couponsGrantedAt = now
  AuditLog(actorId=null, action='coupon.granted', metadata={ userId, campaignId, couponIds })

触发点：问卷提交 service、首次 opt-in service（同事务条件回填 User.firstOptedInAt），事务提交后调用 tryGrantCoupons，try/catch 包裹，失败不阻断主流程、记录告警、下次触发或手动补发。
```

## 券状态机

```txt
ISSUED -> REDEEMED   // 商家核销
ISSUED -> EXPIRED    // 超过 expiresAt（动态判定；可选 cron 落库）
ISSUED -> VOID       // 后台作废（含测试清理）
```

- 终态：`REDEEMED` / `EXPIRED` / `VOID`，不可核销。
- 「可用」（可核销）判定：`status == ISSUED && (expiresAt == null || expiresAt > now) && user.status == ACTIVE`。

## 核销流程（SQL 级三态）

骨架已确认；消费额输入与优惠条件求值见「待设计模块 §B」。

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
   // ⏸️ 待设计 §B：若该券 rule 含金额相关条件/优惠，则在此前先求值（校验 MIN_SPEND、算 actualDiscountAmount），
   //    依赖商家提交的 orderAmount；MVP 不求值、直接按上面条件核销。
2. 影响 1 行：同事务内按 code 重读该已更新券及 template/user 快照（updateMany 仅返回 count）
   create Redemption(couponId, merchantId, merchantUserId=当前账号, userId, faceValueSnapshot=template.faceValue
                     [, orderAmount, actualDiscountAmount  // ⏸️ §B 启用后写入])
   AuditLog(action='coupon.redeemed', metadata={ couponId, merchantId, merchantUserId })
   return SUCCESS + 最小券信息 + merchantPromotion（Merchant.promotionBlocks）
3. 影响 0 行 → 仅在「同商家 + 用户 ACTIVE + status=REDEEMED」时返回 ALREADY_USED；
   其余（跨商家 / 不存在 / 过期 / 用户非 ACTIVE）一律 INVALID，不泄露券是否存在。
```

- `Redemption.couponId @unique` + 事务条件更新保证一张券不被核销两次；并发只有一方更新成功。
- 商家登录失败限流；核销失败不返回券归属细节。

## 数据看板合同

后台 `admin/promotion`，按活动 + 必选时间范围筛选，`isTest` 排除。

| 步骤 | 数据来源 | 口径 |
|------|----------|------|
| 分享 SHARE | `ReferralEvent(SHARE)` count | 分享按钮点击次数（意图） |
| 点击 CLICK | `ReferralEvent(CLICK)` UV（`dedupeKey` 去重 + 去 bot UA） | 落地页访问 UV（有效点击） |
| 注册 REGISTER | `User`（`referralCampaignId`=该活动；`isTest=false`） | 注册人数 |
| 激活 ACTIVATE | `CampaignActivation`（该活动） | 激活人数（稳定） |
| 获券 GRANT | 该活动下持有 ≥1 张 `Coupon` 的 distinct user（`Coupon→template.campaignId`） | 持有已发券的用户数 |
| 核销 REDEEM | 该活动用户中存在 `Redemption`，count distinct user | 到店核销人数 |

- **邀请排行榜**：按 `referrerUserId`（个人码）与 `inviteCodeId`（运营码）两类来源分别聚合各步人数（分性别），分页。扩展现有 `computeStats` 的性别分桶。
- **券情况**：按商家分组 `granted / redeemed`（按活动筛选走 `template.campaignId` → 取 templates → 聚合 Coupon/Redemption）。
- **核销明细对账**：按商家 + 按天（Asia/Shanghai）核销单数 + `sum(faceValueSnapshot)`。
- 聚合策略：MVP 实时聚合（限时间范围 + 分页）；预留 `DailyCampaignStat`（活动+天汇总，cron）以便数据增长后切换。

## Web UI 组件

### 用户端

```txt
/i/[code]                       # 邀请落地页（公共）
/dashboard/referrals            # 我的邀请
/dashboard/coupons              # 我的优惠券
```

- 邀请页：个人码与二维码、各渠道一键分享按钮（带 `?ch=`，点击调 `POST /referral/events`）、我的邀请漏斗概况。
- 券页：分区展示「可用（ISSUED，显示核销码 + 有效期 + 商家 + 优惠文案）」「已用/已过期」。无「待领取」分区（激活即发可用券）。

### 商家端（独立鉴权）

```txt
/merchant/login                 # 商家账号登录
/merchant/redeem                # 核销页
```

- 核销页：极简——大输入框（券码）+ 大「核销」按钮；三态醒目（绿/黄/红）。`SUCCESS` 展示券标题、优惠、面值、用户名，并在结果区下方渲染**商家推广位**（公众号二维码 + 文案 + 电话）。错误 inline，不抢焦点。
- ⏸️ 待设计 §B 启用后：对需要消费额的券，核销页在输入券码后增加一个「消费金额」输入再提交。

### 后台

```txt
/admin/campaigns                # 活动 + 券包配置（券模板优惠规则 MVP 用最简字段/兜底；完整编辑器见 §A 待设计）
/admin/merchants                # 商家与账号（含店员、重置密码、停用、推广位编辑）
/admin/promotion                # 数据看板（漏斗 / 排行榜 / 券情况 / 核销明细）
```

- 沿用现有 admin 布局与 `fetchAdminApiServer` / 客户端组件模式；现有 `/admin/invite-codes` 保留不变。

### Toast 合同

只在主动操作成功后显示克制 toast：`分享链接已复制`、核销页 `核销成功`。被动状态变化、对方操作、校验失败、服务端错误不显示 toast（错误 inline）。

## 安全与访问控制

- 三套会话隔离：用户 `JwtAuthGuard`、后台 `AdminGuard`、商家 `MerchantGuard`（参考 `admin.guard.ts`）。商家 env：`MERCHANT_JWT_SECRET`、`MERCHANT_COOKIE_NAME`、TTL；登录失败限流。
- `GET /me/coupons` 只返回当前用户的券；核销只允许登录商家、且券属于该商家模板。
- 核销校验持券用户 `status == ACTIVE`、券 `status == ISSUED` 未过期；跨商家、过期、非 ACTIVE 一律 `INVALID`，不泄露存在性。
- `referralCampaignId` 注册后不可改；自邀请服务端拒绝；个人码 `?c=` 仅接受有效活动，防客户端篡改归属。
- 券码 10 位随机；输入 `trim + uppercase`，非法长度直接拒。
- `isTest` 全程排除统计；点击 UV 去重 + 每 IP 限频，分享可选每用户限频。
- 商家密码 argon2；停用账号/商家立即拒绝登录与核销。
- `Merchant.promotionBlocks` 的图片 URL / 文案需做基本校验与转义，避免后台注入。

## 审计事件

```txt
referral.personal_code_generated
campaign.created / campaign.updated
coupon_template.created / coupon_template.updated
coupon.granted          # 系统激活发放 ISSUED（actorId=null）
coupon.redeemed         # 商家核销（metadata 含 merchantId / merchantUserId）
coupon.voided
merchant.created / merchant.updated     # 含 promotionBlocks 编辑
merchant_user.created / merchant_user.updated   # 含重置密码 / 停用
```

元数据只含 ID，不含码值或 secret。后台操作记 `adminActorId`；用户操作记 `actorId`；系统发券 `actorId=null`；商家维度记入 metadata。

## 测试

API 单元测试：

- 个人码 10 位 / 运营码 8 位长度路由互不碰撞；落地页非 8/10 位 → `INVALID`。
- 注册来源解析与活动冻结：运营码优先并丢弃个人码 cookie；`?c=` 非 ACTIVE 视为无来源；无来源但有 default 时注册即冻结；冻结后不漂移。
- 自邀请被拒。
- `firstOptedInAt` 在 opt-in→opt-out→opt-in 序列下只写一次、不被清空。
- 激活发券幂等：重复触发、两触发点并发只发一套；P2002 在 `[userId,templateId]` 视为已发、在 `code` 上重试。激活即发 `ISSUED`，`expiresAt` 从发放算。
- 归属活动 ENDED/不存在不发券、不改归属；空归属不发券（激活不再 fallback default）。
- 核销三态：ISSUED 且用户 ACTIVE → SUCCESS（且返回 merchantPromotion）；REDEEMED → ALREADY_USED；过期 / 用户非 ACTIVE / 跨商家 / 不存在 → INVALID。
- 并发核销同一券只成功一次，另一方 ALREADY_USED。
- 漏斗各步与排行榜聚合：性别分桶、isTest 排除、核销 count distinct user；券情况/对账按单数。
- `deleteAllTestUsers` 在测试用户有券/核销/激活时，先清理关联再删除成功。

Web / 组件测试：

- 邀请页渲染个人码与各渠道分享链接，点分享上报 SHARE。
- 券页分区渲染 ISSUED/REDEEMED/EXPIRED；ISSUED 显示核销码与有效期。
- 商家核销页三态渲染正确、SUCCESS 展示券信息 + 商家推广位、错误 inline。
- 后台看板按活动 + 时间范围渲染漏斗/排行榜/券情况/对账，排行榜分页。
- Toast 只在复制链接、核销成功出现。

## 待设计模块（交后续技术人员实现）

> 本合同其余部分**不依赖**以下两块的最终形态：已预留**数据库位**（`CouponTemplate.rule`、`Redemption.orderAmount/actualDiscountAmount`）与**共享接口**（`@lilink/shared` 的 `evaluateCoupon` / `renderBenefitText` / `requiresOrderAmount` / `validateCouponRule`，**M0 即给最简 stub 实现**）。`RedeemCouponDto.orderAmount` 在 §B 启用时再加（MVP 的 DTO 不含此字段）。在它们定稿前 MVP 用「最简兜底」跑通：`rule` 存最简优惠（如 `{ amountOff }`），`benefitText` 由 `renderBenefitText` 的 stub 用模板字段拼，核销不输金额、不求值。

### §A 优惠规则建模（条件 / 组合 / 表达力）

**问题**：扁平字段只能表达单一简单优惠，无法组合（满减 + 赠品）、无条件（时段 / 首次到店）、无阶梯。

**权衡（三档，复杂度递增）**：
1. **扁平字段**：`amountOff / minSpend / percentOff / giftDescription`。最简，零额外校验/UI；表达力最弱。
2. **克制版本化 DSL（推荐方向）**：`rule = { version, conditions: CouponCondition[](AND), benefits: CouponBenefit[](组合) }`。可表达「满减 + 赠品」「限时段」等组合；用 discriminated union，配 `@lilink/shared` 的求值/渲染/校验纯函数；可扩展（version + Json，未来加阶梯/商品级/OR 不破坏旧数据）。代价：后台要做规则编辑器 UI、求值与校验逻辑。
3. **完整规则引擎**：任意条件表达式 / AST 求值。表达力最强，但实现/校验/UI 成本高，校园场景过度。

**预留接口（无论选哪档都应满足，便于其余模块解耦）**：
```ts
// @lilink/shared/coupon.ts（M0 已落地占位 stub；§A 定稿后替换实现，签名尽量保持稳定）
export type CouponRule = Record<string, unknown>; // §A 定稿后换 versioned discriminated union
// 核销求值（M0 stub：恒 { ok: true }，不校验金额/条件）
export function evaluateCoupon(rule: CouponRule | null | undefined, ctx: { orderAmount?: number; now: Date }):
  { ok: boolean; reason?: string; computedDiscount?: number };
// 展示成人话（M0 stub：接收模板描述符、返回 title 兜底；§A 定稿后可改为基于 rule）
export function renderBenefitText(benefit: { benefitType: CouponBenefitType; title: string; faceValue: number; rule?: CouponRule | null }): string;
export function requiresOrderAmount(rule?: CouponRule | null): boolean; // 是否需要商家输入消费额（驱动 §B）；M0 stub 恒 false
export function validateCouponRule(rule: unknown): CouponRule;          // 创建券模板时校验（M0 stub：接受对象/null）
```
**不变量**：`CouponTemplate.faceValue` 始终是对账锚点，独立于 rule 形态；rule 仅决定「能否核销 + 实际优惠」。

### §B 核销消费额与优惠条件求值（信任 vs 验证）

**问题**：当前默认信任商家，核销只验券码。是否让商家输入实际消费额用于校验满减门槛 / 算折扣减免 / 对账？

**关键认知**：输入金额**不能防欺诈**（商家可填假），其价值是：① 满减券系统侧校验门槛（防诚实商家误核销）；② 折扣券算实际减免、对账更真实；③ 留可与小票抽查核对的数据。

**权衡**：
- **不输入（纯信任）**：最快；满减门槛与折扣对账靠商家自觉。
- **按券类型条件输入（推荐方向）**：`requiresOrderAmount(rule)` 为 true（含 MIN_SPEND 或 PERCENT_OFF）的券才要求输入并 `evaluateCoupon` 校验/计算；其余券保持极速。
- **全部必填**：对账最全但最慢。

**接入点（§B 启用时）**：在 `RedeemCouponDto` 增加 `orderAmount?`、核销事务内在条件更新前调用 `evaluateCoupon`、`Redemption.orderAmount/actualDiscountAmount` 落库、核销页对需金额的券增加金额输入。MVP 阶段这些均不启用。

**防欺诈方向（独立于是否输入金额，留作后续）**：异常核销告警（同券短时多次尝试、单店核销量异常）、小票抽样核对，可做成看板风控信号。

## 里程碑

每个里程碑各出一份实现计划。依赖 M0 → M1 → M2 → M3 → M4。

- **M0 数据模型**：Prisma 扩展 + 迁移（含 partial unique index）+ `@lilink/shared` 枚举/长度常量/promotion 类型 + `generateHumanCode` + invite-code 重构 + 更新 `deleteAllTestUsers` + 回填存量 `referralCode` / `firstOptedInAt`（从 `CycleParticipation.optedInAt` 最早值）。`CouponTemplate.rule` 与求值接口以占位形态落库（§A 兜底）。
- **M1 邀请追踪**：个人码生成/回填、落地页 + 点击事件、注册来源记录与活动冻结、`firstOptedInAt` 回填、分享上报、`/dashboard/referrals`。
- **M2 优惠券**：活动 + 券包后台、`CampaignActivation` + 激活自动发券（ISSUED）、`/dashboard/coupons`。优惠规则先用 §A 兜底，编辑器/DSL 待 §A 定稿。
- **M3 商家核销**：商家与账号后台 + 推广位编辑、`MerchantGuard` + 登录、核销页与 SQL 级三态（含 ACTIVE 用户校验）+ 核销成功页推广位。消费额/求值待 §B 定稿。
- **M4 数据看板**：漏斗 / 排行榜 / 券情况 / 核销明细对账。

## 待定决策

- 过期 / 收敛方式：动态判定为准；是否加 cron 把 `EXPIRED` 落库供统计，留待实现时选择，一旦落库即终态。
- §A 优惠规则建模档位（扁平 / 克制 DSL / 引擎）——交后续技术人员。
- §B 核销是否输入消费额及求值策略——交后续技术人员。
- 商家自助管理店员 / 自助查看本店核销明细：MVP 仅后台管理 + 核销页，后续可扩展商家端。

## 实施进度

> 按 §里程碑 推进；本节记录已落地与显式延期的部分，供接手者对照。

### M0 数据模型地基 — 已完成（2026-05-22，经 codex 检查无 Blocker）

已实施并验证：
- **Prisma schema** 扩展：6 枚举（ReferralChannel / ReferralEventType / CampaignStatus / CouponBenefitType / CouponStatus / MerchantUserRole）+ 8 模型（Campaign / CouponTemplate / CampaignActivation / Coupon / Merchant / MerchantUser / Redemption / ReferralEvent）+ User/InviteCode 扩展字段。
- **迁移** `apps/api/prisma/migrations/20260522120000_merchant_promotion_system/`（`migrate diff` 生成 + 末尾手加 partial unique index `campaign_single_active_default`）。**⚠️ 尚未 apply（本机无运行中的数据库）；有 DB 时执行 `prisma migrate deploy`。**
- **`@lilink/shared`** 新增 `referral / campaign / coupon / merchant / human-code` 模块 + index 导出；`generateHumanCode`（Web Crypto + rejection sampling，无偏、跨平台）+ 长度常量（INVITE=8 / PERSONAL=10 / COUPON=10）。
- **验证**：`prisma validate` 通过、`prisma generate`（Client 7.8.0）成功、`build:shared` 通过、api `nest build` 通过、`invite-code.service.spec` 10/10 通过（无回归）。

### 显式延期 / 未实施（避免在未定或有争议处乱实施）

- **§A 优惠规则建模、§B 核销消费额求值**：仅落地数据位（`CouponTemplate.rule`、`Redemption.orderAmount/actualDiscountAmount`）与 `@lilink/shared` 占位 stub（`evaluateCoupon`/`renderBenefitText`/`requiresOrderAmount`/`validateCouponRule`，均不含 DSL/金额逻辑）。**交后续技术人员设计。**
- **invite-code 重构为复用 `generateHumanCode`**：现有实现工作正常且有单测，重构非必要、有回归风险 → 延后。
- **`deleteAllTestUsers` 同步清理新表**：M0 尚未发券/激活，新外键暂不阻断物理删除（codex 确认取舍成立）→ **M2 发券前必须补**（先清理 `Redemption → Coupon → CampaignActivation`、解开 referral 引用）。
- **存量用户 `referralCode` / `firstOptedInAt` 回填**：需运行中的数据库 → 随 M1 实施时补回填脚本。

### M1 邀请追踪 — api 核心已完成（2026-05-22，经 codex 检查）

已实施并验证（单元测试 + 编译；集成/e2e 待有 DB）：
- referral 模块：`assignReferralCodeIfMissing`（整体吞错不阻断注册、`updateMany` null-guard CAS 防并发覆盖、唯一碰撞重试）+ `resolveRegistrationAttribution`（归属优先级：运营码快照 > 个人码 ACTIVE 链接活动 > ACTIVE default > none）。
- 注册接入：`auth.register` 解析并冻结归属写入 `user.create`、注册后赋个人码；`RegisterDto` 增 referralCode/channel/campaignSlug；ReferralService 注入。
- `account.setParticipation`：首次 opt-in 回填 `User.firstOptedInAt`（幂等 null-guard updateMany，opt-out 不碰）。
- 单元测试：referral 12/12、auth 34/34、account 49/49；nest build green。

**codex 复核遗留（标注待办，建议有 DB e2e 时一并做）**：
- Should-fix：`setParticipation` 的 `firstOptedInAt` 回填与 `cycleParticipation.upsert` 未同事务（合同要求同事务）。当前后果可被下次 opt-in 自愈；事务化需重构 setParticipation + 其 20+ 单测的 prisma mock，待 e2e 时做更稳。
- Should-fix：`resolveRegistrationAttribution` 在注册事务前查归属，存在极小竞态窗口；建议改为传入 tx、注册事务内冻结。
- Nice：补 `firstOptedInAt` 行为单测（opt-in 写 / opt-out 不碰 / 重复 opt-in 用 null guard）。

### M1 剩余（未开始）
- api 端点：`GET /me/referral`、`POST /referral/events`(SHARE)、`POST /referral/click`(CLICK，UV 去重 + 限流)。
- web：落地页 `/i/[code]`、`dashboard/referrals`、注册表单回传来源。

### 后续里程碑（未开始）
M2 优惠券 / M3 商家核销 / M4 数据看板 — 见 §里程碑。
