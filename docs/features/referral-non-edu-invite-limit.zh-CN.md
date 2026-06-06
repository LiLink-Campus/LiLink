# LiLink 个人推荐码注册与非教育邮箱次数风控开发计划书

当前分支：`feature/invite-registration`  
核心原则：本功能不改 `InviteCode`，不涉及 8 位运营邀请码；主角是现有 10 位 `User.referralCode`。

## 1. 目标与业务规则

本次功能围绕“个人推荐码”建立注册关系：

- 教育邮箱注册：可不填推荐码；若填写有效 `referralCode`，必须绑定 `referredByUserId`，不消耗推荐额度。
- 非教育邮箱注册：必须填写有效 `referralCode`，必须手动选择学校，并消耗推荐人的非教育邮箱推荐额度。
- 推荐额度属于“推荐人用户”，不是邀请码表：默认每个用户允许推荐 3 个非教育邮箱用户。
- “我的邀请”页面继续基于 `User.referredByUserId` 展示被邀请人，同时新增非教育邮箱额度信息。

## 2. Step 1 验证码阶段调整

目标文件：[auth.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/auth/auth.service.ts:65)

当前 `requestCode` 会调用严格的 `resolveAllowedSchool`，非教育邮箱无法收到验证码。需要拆分 nullable 解析与严格解析：

```ts
private async resolveSchoolByEmail(email: string) {
  return this.schoolResolverService.resolveByEmail(email);
}

private async resolveAllowedSchool(email: string) {
  const resolvedSchool = await this.resolveSchoolByEmail(email);
  if (!resolvedSchool) {
    throw new BadRequestException(
      'This email domain is not currently accepted.',
    );
  }
  return resolvedSchool;
}
```

`requestCode` 改为允许非教育邮箱：

```ts
async requestCode(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const school = await this.resolveSchoolByEmail(normalizedEmail);
  const result = await this.sendVerificationCode(normalizedEmail, 'register');

  return {
    ...result,
    school,
    registrationMode: school ? 'SCHOOL_EMAIL' : 'NON_EDU_REFERRAL_REQUIRED',
  };
}
```

前端 Step 1 收到 `school: null` 时进入非教育邮箱模式，并提示：

> 检测到非教育邮箱，后续步骤将必须填写有效推荐码，并选择你的学校。

## 3. Prisma Schema 变更

目标文件：[schema.prisma](D:/yanyingtong/Github/LiLink/apps/api/prisma/schema.prisma:187)

只修改 `User` 模型：

```prisma
model User {
  id                    String  @id @default(cuid())
  email                 String  @unique
  passwordHash          String

  // existing fields...

  referralCode          String? @unique
  referredByUserId      String?
  referredBy            User?   @relation("UserReferral", fields: [referredByUserId], references: [id], onDelete: SetNull)
  referrals             User[]  @relation("UserReferral")

  nonEduReferralLimit   Int     @default(3)
  nonEduReferralUses    Int     @default(0)

  // existing relations and indexes...

  @@index([referredByUserId, createdAt])
}
```

建议 migration SQL 增加约束：

```sql
ALTER TABLE "User"
  ADD COLUMN "nonEduReferralLimit" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "nonEduReferralUses" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
  ADD CONSTRAINT "User_nonEduReferralLimit_nonnegative_chk"
  CHECK ("nonEduReferralLimit" >= 0);

ALTER TABLE "User"
  ADD CONSTRAINT "User_nonEduReferralUses_nonnegative_chk"
  CHECK ("nonEduReferralUses" >= 0);
```

## 4. 注册事务改造

目标文件：

- [auth.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/auth/auth.service.ts:74)
- [dto.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/auth/dto.ts:24)
- [referral.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/referral/referral.service.ts:126)

`RegisterDto` 新增：

```ts
@IsOptional()
@IsString()
@MaxLength(64)
manualSchoolId?: string;
```

推荐码解析建议迁入 `ReferralService`，让推荐归属逻辑集中：

```ts
async resolvePersonalReferralForRegistration(
  input: {
    referralCode?: string | null;
    channel?: string | null;
    campaignSlug?: string | null;
  },
  client: ReferralReadClient,
  options: { requireValid: boolean },
) {
  const code = input.referralCode?.trim().toUpperCase();

  if (!code) {
    if (options.requireValid) {
      throw new BadRequestException(
        'Referral code is required for non-school email registration.',
      );
    }
    return {
      referredByUserId: null,
      referralChannel: null,
      referralCampaignId: await this.resolveDefaultCampaignId(client),
    };
  }

  const referrer = await client.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });

  if (!referrer) {
    throw new BadRequestException('Referral code is invalid.');
  }

  return {
    referredByUserId: referrer.id,
    referralChannel: readReferralChannel(input.channel),
    referralCampaignId: await this.resolveReferralCampaignId(
      client,
      input.campaignSlug,
    ),
  };
}
```

`AuthService.register` 核心流程：

```ts
async register(input: RegisterDto, localeCookie?: SupportedLocale | null) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const resolvedSchool = await this.resolveSchoolByEmail(normalizedEmail);
  const isNonEduEmail = !resolvedSchool;

  await this.assertRegistrationCapacityPreflight(this.prisma);
  await this.assertVerificationCodeIsValid(
    this.prisma,
    normalizedEmail,
    'register',
    input.code,
  );

  const passwordHash = await argon2.hash(input.password);

  const user = await this.prisma.$transaction(async (tx) => {
    await this.assertRegistrationCapacity(tx);

    const schoolId = resolvedSchool
      ? resolvedSchool.schoolId
      : await this.resolveManualSchoolId(tx, input.manualSchoolId);

    const attribution =
      await this.referralService!.resolvePersonalReferralForRegistration(
        {
          referralCode: input.referralCode,
          channel: input.channel,
          campaignSlug: input.campaignSlug,
        },
        tx,
        {
          requireValid: isNonEduEmail || Boolean(input.referralCode?.trim()),
        },
      );

    if (isNonEduEmail) {
      await this.consumeNonEduReferralQuota(
        tx,
        attribution.referredByUserId!,
      );
    }

    await this.consumeVerificationCode(
      tx,
      normalizedEmail,
      'register',
      input.code,
    );

    return tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        status: 'ACTIVE',
        displayName: input.displayName,
        preferredLocale: localeCookie ?? undefined,
        schoolId,
        referredByUserId: attribution.referredByUserId,
        referralChannel: attribution.referralChannel,
        referralCampaignId: attribution.referralCampaignId,
        acceptedTermsAt: input.acceptedTerms ? new Date() : null,
        lastLoginAt: new Date(),
        lastActiveAt: new Date(),
        profile: { create: { fullName: input.fullName } },
      },
    });
  });

  await this.referralService?.assignReferralCodeIfMissing(user.id);
  return this.issueAuthPayload(/* existing args */);
}
```

CAS 扣减建议使用单条 SQL，可靠比较同一行两个字段：

```ts
private async consumeNonEduReferralQuota(
  tx: TransactionClient,
  referrerUserId: string,
) {
  const affectedRows = await tx.$executeRaw(Prisma.sql`
    UPDATE "User"
    SET "nonEduReferralUses" = "nonEduReferralUses" + 1
    WHERE "id" = ${referrerUserId}
      AND "nonEduReferralUses" < "nonEduReferralLimit"
  `);

  if (affectedRows !== 1) {
    throw new BadRequestException(
      'Referral quota for non-school email registration has been exhausted.',
    );
  }
}
```

该扣减发生在同一个注册事务内。如果后续验证码消费或 `user.create` 失败，额度扣减自动回滚。

## 5. 管理后台接口与审计

目标路径：

```http
PATCH /v1/admin/users/:id/referral-limit
```

目标文件：

- [admin.controller.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/admin/admin.controller.ts:227)
- [admin.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/admin/admin.service.ts:1562)
- [admin-audit.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/admin/admin-audit.service.ts:147)

DTO：

```ts
export class UpdateUserReferralLimitDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  nonEduReferralLimit!: number;
}
```

Controller：

```ts
@Patch('users/:userId/referral-limit')
updateUserReferralLimit(
  @Req() request: AdminAuthenticatedRequest,
  @Param('userId') userId: string,
  @Body() body: UpdateUserReferralLimitDto,
) {
  return this.adminService.updateUserReferralLimit(
    userId,
    body,
    request.admin!.id,
  );
}
```

Service：

```ts
async updateUserReferralLimit(
  userId: string,
  input: UpdateUserReferralLimitDto,
  adminActorId: string,
) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nonEduReferralLimit: true,
      nonEduReferralUses: true,
    },
  });

  if (!user) {
    throw new NotFoundException('User not found.');
  }

  const updatedUser = await this.prisma.user.update({
    where: { id: userId },
    data: {
      nonEduReferralLimit: input.nonEduReferralLimit,
    },
    omit: { passwordHash: true },
  });

  await this.adminAuditService.write(
    adminActorId,
    'user.referral_limit_updated',
    {
      userId,
      previousLimit: user.nonEduReferralLimit,
      nextLimit: input.nonEduReferralLimit,
      nonEduReferralUses: user.nonEduReferralUses,
    },
  );

  return updatedUser;
}
```

建议允许管理员把上限调低到小于已使用数，此时剩余额度按 `max(0, limit - uses)` 展示，效果是立即阻止新的非教育邮箱推荐注册。

## 6. “我的邀请”页面联动

目标文件：

- [referral.service.ts](D:/yanyingtong/Github/LiLink/apps/api/src/modules/referral/referral.service.ts:290)
- [api.ts](D:/yanyingtong/Github/LiLink/apps/web/src/lib/api.ts:462)
- [referrals-client.tsx](D:/yanyingtong/Github/LiLink/apps/web/src/app/dashboard/referrals/referrals-client.tsx:38)

`getMyReferralOverview` 增加额度字段：

```ts
return {
  referralCode,
  links,
  funnel: { invited, registered: invited, activated, granted, redeemed },
  nonEduQuota: {
    limit: user.nonEduReferralLimit,
    uses: user.nonEduReferralUses,
    remaining: Math.max(0, user.nonEduReferralLimit - user.nonEduReferralUses),
  },
};
```

前端类型：

```ts
export type MyReferralOverview = {
  referralCode: string | null;
  links: { channel: string; url: string }[];
  funnel: ReferralFunnel;
  nonEduQuota: {
    limit: number;
    uses: number;
    remaining: number;
  };
};
```

页面展示建议：

- 在个人推荐码卡片附近显示“普通邮箱推荐名额：已用 X / 共 Y”。
- 教育邮箱邀请仍进入 funnel，不占用该额度。
- 不展示被邀请人的敏感邮箱明细，沿用现有 funnel 汇总风格。

## 7. 注册页前端联动

目标文件：[register-page-client.tsx](D:/yanyingtong/Github/LiLink/apps/web/src/app/register/register-page-client.tsx:47)

新增状态：

```ts
const [requiresNonEduReferral, setRequiresNonEduReferral] = useState(false);
const [manualSchoolId, setManualSchoolId] = useState("");
```

Step 1 成功后：

```ts
const isNonEdu =
  result.registrationMode === "NON_EDU_REFERRAL_REQUIRED" || !result.school;

setResolvedSchool(result.school ?? null);
setRequiresNonEduReferral(isNonEdu);
setStep(2);
```

Step 2 校验：

```ts
if (requiresNonEduReferral && !referralCode.trim()) {
  setError("检测到非教育邮箱，请填写有效推荐码。");
  return;
}

if (requiresNonEduReferral && !manualSchoolId.trim()) {
  setError("检测到非教育邮箱，请选择你的学校。");
  return;
}
```

提交 body：

```ts
body: JSON.stringify({
  email,
  code,
  password,
  displayName,
  fullName,
  acceptedTerms,
  referralCode: referralCode.trim() || undefined,
  manualSchoolId: manualSchoolId.trim() || undefined,
  channel: referralChannel || undefined,
  campaignSlug: campaignSlug || undefined,
})
```

UI 设计：

```tsx
<Field
  label={requiresNonEduReferral ? "推荐码（必填）" : "推荐码（可选）"}
  hint={
    requiresNonEduReferral
      ? "普通邮箱注册必须填写一位已注册用户的个人推荐码。"
      : "如果是朋友邀请你加入，可填写 TA 的个人推荐码。"
  }
>
  <Input
    required={requiresNonEduReferral}
    readOnly={attributionLocked}
    value={referralCode}
    maxLength={INVITE_CODE_MAX_LENGTH}
    onChange={(event) => setReferralCode(event.target.value)}
    placeholder="请输入 10 位推荐码"
  />
</Field>
```

学校下拉需要公共学校数据包含 `id`。建议扩展 `GET /v1/public/schools` 返回 `id`，并新增或补齐 `Select` primitive，复用 `.ui-select` 样式，避免业务 CSS 重写输入控件。

## 8. 测试计划

后端重点测试：

- 非教育邮箱 `requestCode` 不抛错，返回 `school: null`。
- 非教育邮箱注册缺少 `referralCode` 时拒绝，且不消费验证码。
- 非教育邮箱注册推荐码无效时拒绝，且不消费验证码。
- 非教育邮箱注册推荐人额度已满时拒绝，且不创建用户。
- 非教育邮箱注册成功时，`nonEduReferralUses + 1`，新用户写入 `referredByUserId`。
- 教育邮箱填写推荐码时，写入 `referredByUserId`，但不增加 `nonEduReferralUses`。
- 教育邮箱未填写推荐码时，保持现有注册路径。
- 管理员修改 `nonEduReferralLimit` 写入 `AdminAuditService`。

建议执行：

```powershell
npm run build:shared
npm run test --workspace api -- auth.service.spec.ts referral.service.spec.ts
npm run typecheck:web
npm run lint:web-boundary
```

## 9. 最终决策摘要

本计划以 `User.referralCode` 为唯一邀请入口。教育邮箱使用推荐码只建立邀请关系，不消耗额度；非教育邮箱必须使用有效个人推荐码，并在注册事务内对推荐人执行 CAS 扣减。`InviteCode`、8 位运营码和 `InviteCode` 后台本次全部不改动。
