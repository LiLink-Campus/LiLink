# LiLink 个人推荐码注册与非教育邮箱次数风控开发计划书

当前分支：`feature/invite-registration`

本文基于最新主干重新扫描后的真实代码编写。核心原则：本功能完全不改 `InviteCode`，不涉及 8 位运营邀请码；唯一邀请入口是现有 10 位个人推荐码 `User.referralCode`。

## 1. 当前真源对齐结论

### 后端注册链路

- `apps/api/src/modules/auth/auth.service.ts`
  - `AuthService.requestCode(email)` 目前约在第 61 行，先将邮箱 trim/lowercase，然后调用 `resolveAllowedSchool(normalizedEmail)`。这会让非教育邮箱在验证码阶段直接被拒绝。
  - `AuthService.register(input, localeCookie?)` 目前约在第 70 行，同样先调用 `resolveAllowedSchool(normalizedEmail)`。注册事务内当前先 `consumeVerificationCode(...)`，再调用 `referralService?.resolveRegistrationAttribution(...)`，最后创建 `User`。
  - 当前 `AuthService` 构造函数只注入 `ReferralService`，已经没有 `InviteCodeService` 注入，这与本次“不碰 8 位运营邀请码”的业务方向一致。

### 推荐码与邀请统计

- `apps/api/src/modules/referral/referral.service.ts`
  - `assignReferralCodeIfMissing(userId)` 目前约在第 60 行，为用户生成 10 位个人推荐码，使用 `updateMany({ where: { id: userId, referralCode: null } })` 做 CAS，避免并发覆盖。
  - `resolveRegistrationAttribution(input, client)` 目前约在第 118 行，按 `input.referralCode` 查找推荐人，并返回 `referredByUserId / referralChannel / referralCampaignId`。
  - 行为约定：**仅非教育邮箱**必须填写有效推荐码（缺失/无效一律抛错）。教育邮箱保持原有宽松行为——无效推荐码静默忽略，注册照常继续（仅不记录推荐关系），避免一个过期/手误的可选推荐码挡住合法学校邮箱注册。
  - `getMyReferralOverview(userId)` 目前约在第 266 行，返回 `referralCode`、`links` 和 `funnel`。`funnel` 字段为 `invited / registered / activated / granted / redeemed`。

### 前端注册页

- `apps/web/src/app/register/register-page-client.tsx`
  - 当前状态变量只有 `referralCode`、`referralChannel`、`attributionLocked`、`campaignSlug`，没有 `inviteCode` state。
  - 当前常量为 `REGISTER_REFERRAL_CODE_MAX_LENGTH`，不是 `INVITE_CODE_MAX_LENGTH`。
  - `/i/[code]` 写入的 `lilink_ref` cookie 只在 `refCode.length === PERSONAL_CODE_LENGTH` 时填入 `setReferralCode(refCode)` 并锁定。
  - 当前 UI 文案仍显示“邀请码”，但实际字段和请求体都是 `referralCode`。

### 我的邀请页

- `apps/web/src/app/dashboard/referrals/referrals-client.tsx`
  - 使用 `fetchMyReferral()` 拉取 `MyReferralOverview`。
  - 当前页面读取 `data.referralCode`、`data.links`、`data.funnel.invited`。
  - `INVITE_PROGRESS` 目前只渲染 `"invited" | "activated"` 两个步骤；后端已有 `registered / granted / redeemed` 字段，但该页面未全部展示。

## 2. 业务规则

1. 教育邮箱注册：
   - 可以不填推荐码。
   - 如果填写有效 `referralCode`，必须绑定 `User.referredByUserId`。
   - 不消耗推荐人的非教育邮箱推荐额度。
   - 如果填写了无效推荐码，**静默忽略该推荐码**，注册照常成功（不记录推荐关系），不报错。

2. 非教育邮箱注册：
   - 验证码阶段：必须先提交有效个人推荐码（推荐人 `ACTIVE` 且有剩余额度）才会发送验证码。该预检为**只读**（不扣额度），仅用于把验证码邮件限定在持有有效邀请码的请求；额度的真正扣减在 `register` 事务内完成。
   - 防滥用：`request-code` 增设按推荐码维度的限流桶（`auth-throttle.ts` 的 `authReferral`，默认每分钟 10 次/码），防止单个有效邀请码被复用向任意邮箱发起验证码邮件轰炸（每 IP 上限 1000/分钟，单靠它不足以约束按邮箱变化的扇出）。
   - 注册阶段必须填写有效 10 位个人推荐码。
   - 注册阶段必须手动选择学校，写入新用户的 `schoolId`。
   - 必须在同一个注册事务内对推荐人执行 CAS 额度扣减。
   - 额度条件为 `nonEduReferralUses < nonEduReferralLimit`。

3. 本功能不改：
   - `InviteCode` 模型。
   - `InviteCodeService`。
   - `admin/invite-codes` 后台页面和接口。
   - 8 位运营邀请码路径。

## 3. Prisma Schema 变更

目标文件：`apps/api/prisma/schema.prisma`

只在 `User` 模型增加两个字段：

```prisma
model User {
  id                         String                       @id @default(cuid())
  email                      String                       @unique
  passwordHash               String
  status                     UserStatus                   @default(PENDING)
  schoolId                   String?
  school                     School?                      @relation(fields: [schoolId], references: [id])

  // existing fields...

  referralCode               String?                      @unique
  referredByUserId           String?
  referredBy                 User?                        @relation("UserReferral", fields: [referredByUserId], references: [id], onDelete: SetNull)
  referrals                  User[]                       @relation("UserReferral")
  referralChannel            ReferralChannel?
  referralCampaignId         String?
  referralCampaign           Campaign?                    @relation("UserReferralCampaign", fields: [referralCampaignId], references: [id], onDelete: Restrict)

  nonEduReferralLimit        Int                          @default(3)
  nonEduReferralUses         Int                          @default(0)

  // existing relations and indexes...

  @@index([referredByUserId, createdAt])
}
```

建议 migration SQL：

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

字段语义：

- `nonEduReferralLimit`：该用户作为推荐人时，可邀请非教育邮箱注册的总额度，默认 3。
- `nonEduReferralUses`：该用户作为推荐人时，已经消耗的非教育邮箱注册次数。
- 教育邮箱通过该推荐码注册时，只写 `referredByUserId`，不改变 `nonEduReferralUses`。

## 4. Step 1 验证码阶段改造

目标文件：`apps/api/src/modules/auth/auth.service.ts`

当前 `requestCode` 调用严格的 `resolveAllowedSchool`，需要拆出 nullable 解析方法：

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

`requestCode` 改为：

```ts
async requestCode(email: string, referralCode?: string | null) {
  const normalizedEmail = email.trim().toLowerCase();
  const school = await this.resolveSchoolByEmail(normalizedEmail);

  if (!school) {
    // 只读预检：非学校邮箱必须先提交有效邀请码才发码；不扣额度。
    await this.assertValidReferralBeforeNonSchoolRequestCode(referralCode);
  }

  const result = await this.sendVerificationCode(normalizedEmail, 'register');

  return {
    ...result,
    school,
    registrationMode: school ? 'SCHOOL_EMAIL' : 'NON_EDU_REFERRAL_REQUIRED',
  };
}
```

说明：

- 非教育邮箱仍必须满足 `RequestCodeDto` 的 `@IsEmail()` 和 `EMAIL_MAX_LENGTH`。
- `requestCode` 对非学校邮箱做**只读**推荐码预检（`assertValidReferralBeforeNonSchoolRequestCode`）后才发送验证码：把验证码邮件限定在持有有效邀请码的请求，并配合 `authReferral` 按码限流防止邮件轰炸。该预检不扣额度、不做最终准入。
- 最终准入（额度 CAS 扣减、手动选校、建号）仍必须放在 `register` 事务内完成。

## 5. RegisterDto 扩展

目标文件：`apps/api/src/modules/auth/dto.ts`

当前 `RegisterDto` 已有：

```ts
@IsOptional()
@IsString()
@MaxLength(REGISTER_REFERRAL_CODE_MAX_LENGTH)
referralCode?: string;
```

新增非教育邮箱手动学校字段：

```ts
@IsOptional()
@IsString()
@MaxLength(ADMIN_ID_MAX_LENGTH)
manualSchoolId?: string;
```

如果不希望 `auth` DTO 依赖 admin 命名常量，也可以在通用输入限制中新增 `SCHOOL_ID_MAX_LENGTH`，并在 `AdminUpdateUserDto.schoolId` 与 `RegisterDto.manualSchoolId` 共用。

## 6. ReferralService 改造

目标文件：`apps/api/src/modules/referral/referral.service.ts`

当前 `resolveRegistrationAttribution` 会忽略无效个人推荐码。新功能只需一个 `requireReferralCode`
开关：开启（非教育邮箱）时缺失/无效推荐码一律抛错；关闭（教育邮箱）时保持原有宽松行为，无效
推荐码静默忽略、注册继续：

```ts
async resolveRegistrationAttribution(
  input: RegistrationSourceInput,
  client: ReferralReadClient = this.prisma,
  options: {
    requireReferralCode?: boolean;
  } = {},
): Promise<RegistrationAttribution> {
  let referredByUserId: string | null = null;
  let referralChannel: ReferralChannel | null = null;
  let referralCampaignId: string | null = null;

  const code = input.referralCode?.trim().toUpperCase() ?? '';

  if (!code && options.requireReferralCode) {
    throw new BadRequestException(
      'Referral code is required for non-school email registration.',
    );
  }

  if (code) {
    const referrer = await client.user.findUnique({
      where: { referralCode: code },
      select: { id: true, status: true },
    });

    // 非教育邮箱要求推荐人 ACTIVE；教育邮箱不限制推荐人状态。
    const referrerIsUsable =
      referrer &&
      (!options.requireReferralCode || referrer.status === 'ACTIVE');

    if (!referrerIsUsable) {
      // 仅非教育邮箱（requireReferralCode）抛错；教育邮箱静默忽略并继续。
      if (options.requireReferralCode) {
        throw new BadRequestException('Referral code is invalid.');
      }
    } else {
      referredByUserId = referrer.id;
      referralChannel = readReferralChannel(input.channel);

      if (input.campaignSlug) {
        const campaign = await client.campaign.findUnique({
          where: { slug: input.campaignSlug },
          select: { id: true, status: true },
        });
        if (campaign && campaign.status === 'ACTIVE') {
          referralCampaignId = campaign.id;
        }
      }
    }
  }

  if (!referralCampaignId) {
    const fallback = await client.campaign.findFirst({
      where: { isDefault: true, status: 'ACTIVE' },
      select: { id: true },
    });
    referralCampaignId = fallback?.id ?? null;
  }

  return { referredByUserId, referralChannel, referralCampaignId };
}
```

需要同步修改 imports：

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
```

调用规则：

- 非教育邮箱：`requireReferralCode: true`（缺失/无效推荐码一律抛错）。
- 教育邮箱：不传 `requireReferralCode`。无效推荐码静默忽略，注册继续；有效推荐码记录推荐关系。默认 campaign fallback 逻辑不变。

## 7. AuthService.register 事务改造

目标文件：`apps/api/src/modules/auth/auth.service.ts`

关键调整：

- `register` 开头改用 nullable `resolveSchoolByEmail`。
- 当前事务内先消费验证码，再解析推荐关系；新功能应先解析推荐关系并扣减额度，再消费验证码，避免无效推荐码或额度耗尽时烧掉验证码。
- 非教育邮箱必须验证 `manualSchoolId`，并写入新用户的 `schoolId`。

核心伪代码：

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
      (await this.referralService?.resolveRegistrationAttribution(
        {
          referralCode: input.referralCode,
          channel: input.channel,
          campaignSlug: input.campaignSlug,
        },
        tx,
        {
          // 仅非教育邮箱强制有效推荐码；教育邮箱无效推荐码静默忽略。
          requireReferralCode: isNonEduEmail,
        },
      )) ?? {
        referredByUserId: null,
        referralChannel: null,
        referralCampaignId: null,
      };

    if (isNonEduEmail) {
      await this.consumeNonEduReferralQuota(
        tx,
        attribution.referredByUserId,
      );
    }

    await this.consumeVerificationCode(
      tx,
      normalizedEmail,
      'register',
      input.code,
    );

    const now = new Date();

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
        acceptedTermsAt: input.acceptedTerms ? now : null,
        lastLoginAt: now,
        lastActiveAt: now,
        profile: {
          create: {
            fullName: input.fullName,
          },
        },
      },
    });
  });

  if (this.referralService) {
    await this.referralService.assignReferralCodeIfMissing(user.id);
  }

  return this.issueAuthPayload(
    user.id,
    user.email,
    user.displayName,
    user.preferredLocale,
    user.meetupExpirationWeeks,
    localeCookie,
  );
}
```

手动学校校验：

```ts
private async resolveManualSchoolId(
  tx: TransactionClient,
  manualSchoolId?: string | null,
) {
  const schoolId = manualSchoolId?.trim();
  if (!schoolId) {
    throw new BadRequestException(
      'School selection is required for non-school email registration.',
    );
  }

  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { id: true },
  });

  if (!school) {
    throw new BadRequestException('Selected school is invalid.');
  }

  return school.id;
}
```

非教育邮箱额度 CAS 扣减：

```ts
private async consumeNonEduReferralQuota(
  tx: TransactionClient,
  referrerUserId: string | null,
) {
  if (!referrerUserId) {
    throw new BadRequestException(
      'Referral code is required for non-school email registration.',
    );
  }

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

并发说明：

- 额度扣减是单条 `UPDATE ... WHERE uses < limit`。
- PostgreSQL 会对被更新的 `User` 行加行锁。
- 多个非教育邮箱注册同时抢最后一个名额时，只有一个事务能更新成功。
- 如果后续验证码消费或 `user.create` 失败，事务回滚，`nonEduReferralUses` 不会被误扣。

## 8. 管理后台接口与审计

目标路径：

```http
PATCH /v1/admin/users/:userId/referral-limit
```

目标文件：

- `apps/api/src/modules/admin/admin.controller.ts`
- `apps/api/src/modules/admin/dto.ts`
- `apps/api/src/modules/admin/admin.service.ts`
- `apps/api/src/modules/admin/admin-audit.service.ts`

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

Controller 延续当前 `users/:userId` 命名：

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

策略说明：

- 允许管理员把 `nonEduReferralLimit` 调低到小于 `nonEduReferralUses`。
- 前端展示剩余额度时统一使用 `Math.max(0, limit - uses)`。
- 当 `uses >= limit` 后，该用户的推荐码仍可无限邀请教育邮箱，但不可再邀请非教育邮箱注册。

## 9. 我的邀请页面联动

目标文件：

- `apps/api/src/modules/referral/referral.service.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/app/dashboard/referrals/referrals-client.tsx`

后端 `MyReferralOverview` 增加额度字段：

```ts
export interface MyReferralOverview {
  referralCode: string | null;
  links: { channel: ReferralChannel; url: string }[];
  funnel: {
    invited: number;
    registered: number;
    activated: number;
    granted: number;
    redeemed: number;
  };
  nonEduReferralQuota: {
    limit: number;
    uses: number;
    remaining: number;
  };
}
```

`getMyReferralOverview` 需要额外读取当前用户额度：

```ts
const owner = await this.prisma.user.findUnique({
  where: { id: userId },
  select: {
    nonEduReferralLimit: true,
    nonEduReferralUses: true,
  },
});
```

返回：

```ts
return {
  referralCode,
  links,
  funnel: { invited, registered: invited, activated, granted, redeemed },
  nonEduReferralQuota: {
    limit: owner?.nonEduReferralLimit ?? 3,
    uses: owner?.nonEduReferralUses ?? 0,
    remaining: Math.max(
      0,
      (owner?.nonEduReferralLimit ?? 3) - (owner?.nonEduReferralUses ?? 0),
    ),
  },
};
```

前端 `apps/web/src/lib/api.ts` 的 `MyReferralOverview` 同步加字段：

```ts
export type MyReferralOverview = {
  referralCode: string | null;
  links: { channel: string; url: string }[];
  funnel: ReferralFunnel;
  nonEduReferralQuota: {
    limit: number;
    uses: number;
    remaining: number;
  };
};
```

`referrals-client.tsx` 展示建议：

- 在当前“我的邀请码/推荐码”卡片附近展示 `data.nonEduReferralQuota.uses / data.nonEduReferralQuota.limit`。
- 文案明确：该额度只影响“普通邮箱注册”，不影响学校邮箱同学通过你的链接注册。
- 现有 `INVITE_PROGRESS` 只展示 `invited` 和 `activated`，本次无需强制扩展 funnel UI。

## 10. 注册页前端联动

目标文件：`apps/web/src/app/register/register-page-client.tsx`

当前真实 state：

```ts
const [referralCode, setReferralCode] = useState("");
const [referralChannel, setReferralChannel] = useState("");
const [attributionLocked, setAttributionLocked] = useState(false);
const [campaignSlug, setCampaignSlug] = useState("");
```

新增：

```ts
const [requiresNonEduReferral, setRequiresNonEduReferral] = useState(false);
const [manualSchoolId, setManualSchoolId] = useState("");
```

`CodeResponse` 增加：

```ts
type CodeResponse = {
  email: string;
  expiresAt: string;
  school?: {
    schoolName: string;
    matchedDomain: string;
  } | null;
  registrationMode?: "SCHOOL_EMAIL" | "NON_EDU_REFERRAL_REQUIRED";
  devCode?: string;
};
```

`requestCode` 成功后：

```ts
const result = await fetchApi<CodeResponse>("/auth/request-code", {
  method: "POST",
  body: JSON.stringify({ email }),
});

const isNonEdu =
  result.registrationMode === "NON_EDU_REFERRAL_REQUIRED" || !result.school;

setResolvedSchool(result.school ?? null);
setRequiresNonEduReferral(isNonEdu);
setDevCode(result.devCode);
setStep(2);
```

`register` 提交前增加校验：

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

提交体保持使用当前真实字段 `referralCode`，并新增 `manualSchoolId`：

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

推荐码输入框继续使用同一个 `Input`，只调整 required 与文案：

```tsx
<Field
  label={requiresNonEduReferral ? "推荐码（必填）" : "推荐码（可选）"}
  hint={
    attributionLocked
      ? "已通过邀请链接带入，不可修改。"
      : requiresNonEduReferral
        ? "普通邮箱注册必须填写一位已注册用户的个人推荐码。"
        : undefined
  }
>
  <Input
    required={requiresNonEduReferral}
    readOnly={attributionLocked}
    value={referralCode}
    maxLength={REGISTER_REFERRAL_CODE_MAX_LENGTH}
    onChange={(event) => setReferralCode(event.target.value)}
    placeholder={attributionLocked ? undefined : "如有推荐码可填写"}
  />
</Field>
```

学校下拉：

- 当前 `GET /v1/public/schools` 只返回 `name / description / domains`，不返回 `id`。
- 非教育邮箱要提交 `manualSchoolId`，因此需要扩展 public schools payload，或新增只返回 `id/name` 的 public endpoint。
- 当前 `@/components/ui` 只有 `Field / Input / FormMessage`，没有 `Select` 导出；但 `primitives.css` 已有 `.ui-select` 样式。建议在 `apps/web/src/components/ui/index.tsx` 补齐 `Select` primitive。

`Select` primitive：

```tsx
export type SelectProps = ComponentPropsWithoutRef<"select"> & {
  controlSize?: ControlSize;
  radius?: ControlRadius;
  border?: ControlBorder;
};

export function Select({
  controlSize,
  radius,
  border,
  className,
  ...props
}: SelectProps) {
  return (
    <select
      className={controlClassName(
        "ui-select",
        controlSize,
        radius,
        border,
        className,
      )}
      {...props}
    />
  );
}
```

## 11. 测试计划

后端单元测试：

- `AuthService.requestCode`
  - 教育邮箱：返回 `school`，`registrationMode = "SCHOOL_EMAIL"`。
  - 非教育邮箱 + 有效邀请码：发送验证码，返回 `school: null`，`registrationMode = "NON_EDU_REFERRAL_REQUIRED"`。
  - 非教育邮箱 + 缺失/无效邀请码：抛错（`非学校邮箱必须提供有效邀请码方可获取验证码`），不发送验证码。
  - 同一邀请码在 `request-code` 上受 `authReferral` 限流（默认 10 次/分钟/码）。

- `AuthService.register`
  - 教育邮箱未填推荐码：保持现有注册成功路径。
  - 教育邮箱填写有效推荐码：写入 `referredByUserId`，不增加推荐人的 `nonEduReferralUses`。
  - 教育邮箱填写无效推荐码：静默忽略该推荐码，注册照常成功（不写 `referredByUserId`，不抛错）。
  - 非教育邮箱未填推荐码：抛 `Referral code is required...`，不消费验证码。
  - 非教育邮箱填写无效推荐码：抛 `Referral code is invalid.`，不消费验证码。
  - 非教育邮箱推荐人额度已满：抛 quota exhausted，事务回滚。
  - 非教育邮箱注册成功：新用户写入 `referredByUserId`，推荐人 `nonEduReferralUses + 1`。

- `ReferralService`
  - `assignReferralCodeIfMissing` 现有 CAS 行为保持不变。
  - `resolveRegistrationAttribution` strict options 覆盖缺失、无效、有效推荐码。
  - `getMyReferralOverview` 返回 `nonEduReferralQuota`。

- `AdminService`
  - `updateUserReferralLimit` 更新字段。
  - `updateUserReferralLimit` 写 `AdminAuditService.write(adminActorId, 'user.referral_limit_updated', ...)`。

前端检查：

- `register-page-client.tsx` 中无新增 `inviteCode` state。
- 非教育邮箱 Step 2 中 `referralCode` 输入框和学校下拉为 required。
- 教育邮箱保持推荐码可选。
- `referrals-client.tsx` 展示 `data.nonEduReferralQuota`，现有 `data.funnel.invited` 逻辑不被破坏。

建议执行：

```powershell
npm run build:shared
npm run test --workspace api -- auth.service.spec.ts referral.service.spec.ts
npm run typecheck:web
npm run lint:web-boundary
```

## 12. 汇报摘要

本方案已按最新主干校准：

- 不使用 `inviteCode` state；注册页真实载体是 `referralCode`。
- 不使用 `INVITE_CODE_MAX_LENGTH`；当前注册页常量是 `REGISTER_REFERRAL_CODE_MAX_LENGTH`。
- 不修改 `InviteCode` / `InviteCodeService` / `admin/invite-codes`。
- 非教育邮箱额度字段落在 `User` 上：`nonEduReferralLimit` 与 `nonEduReferralUses`。
- 推荐关系仍通过现有 `User.referredByUserId` 建立，并由 `getMyReferralOverview` 的 `funnel.invited` / `registered` 统计进入“我的邀请”页面。
