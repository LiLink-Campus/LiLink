# 邀请码系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后台可创建"拉新人姓名→随机邀请码"映射（仅后台可见），用户注册可选填邀请码归属，后台按问卷性别（男/女/非二元/未填）统计每码人头。

**Architecture:** 方案 A（实时派生）。新增独立 `InviteCodeModule`（NestJS）承载码生成/CRUD/统计/注册解析；`AuthModule` 注入其做注册期校验；`User.inviteCodeId` 记录归属；统计读取时关联问卷已提交答案现算。审计与状态变更同事务，metadata 仅存 `inviteCodeId`。

**Tech Stack:** NestJS + Prisma(Postgres) + class-validator；Next.js(App Router) 后台页与注册表单；`@lilink/shared`（复用 `HARD_MATCH_GENDERS/HARD_MATCH_KEYS/readSingleChoice`）。

**Spec:** `docs/superpowers/specs/2026-05-21-invite-code-system-design.md`（含 §15 codex 评审决议）。

**工作目录:** 独立工作树 `/home/nanzhi/projects/LiLink-invite-code`（分支 `feat/invite-code-system`）。所有命令在该目录运行。

---

## File Structure

**API（新增）**
- `apps/api/src/modules/invite-code/constants.ts` — 字母表/长度/重试上限。
- `apps/api/src/modules/invite-code/dto.ts` — Create/List/SetActive DTO。
- `apps/api/src/modules/invite-code/invite-code.service.ts` — 生成/创建/列表+统计/停用/注册解析。
- `apps/api/src/modules/invite-code/invite-code.controller.ts` — `admin/invite-codes` 端点。
- `apps/api/src/modules/invite-code/invite-code.module.ts` — 模块装配，导出 service。
- `apps/api/src/modules/invite-code/invite-code.service.spec.ts` — 单测。

**API（修改）**
- `apps/api/prisma/schema.prisma` — `InviteCode` 模型 + `User.inviteCodeId`/索引。
- `apps/api/src/common/validation/input-limits.ts` — 两个长度常量。
- `apps/api/src/modules/auth/dto.ts` — `RegisterDto.inviteCode?`。
- `apps/api/src/modules/auth/auth.service.ts` — 解析+落库（构造函数 +1 依赖）。
- `apps/api/src/modules/auth/auth.service.spec.ts` — 更新实例化 + 新增用例。
- `apps/api/src/modules/auth/auth.module.ts` — import `InviteCodeModule`。
- `apps/api/src/app.module.ts` — 注册 `InviteCodeModule`。

**Web（修改/新增）**
- `apps/web/src/app/admin/types.ts` — `AdminInviteCode`。
- `apps/web/src/lib/api.ts` — 错误文案翻译。
- `apps/web/src/app/admin/invite-codes/page.tsx` — 后台页（新）。
- `apps/web/src/app/admin/admin-layout-shell.tsx` — NAV +1。
- `apps/web/src/app/register/register-page-client.tsx` — 邀请码输入。

---

## Phase 1 — 数据模型与迁移

### Task 1: Prisma schema + 迁移

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_add_invite_code/migration.sql`

- [ ] **Step 1: 加模型与字段。** 在 `schema.prisma` 末尾追加 `InviteCode`，并在 `User` 模型内加归属字段与索引。

```prisma
model InviteCode {
  id        String   @id @default(cuid())
  code      String   @unique
  ownerName String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  referrals User[]   @relation("UserInviteCode")

  @@index([isActive, createdAt])
}
```

在 `model User { ... }` 内（关系区与索引区）加：

```prisma
  inviteCodeId          String?
  inviteCode            InviteCode?            @relation("UserInviteCode", fields: [inviteCodeId], references: [id], onDelete: Restrict)
```
并在 `User` 的 `@@index(...)` 区追加：`@@index([inviteCodeId])`。

- [ ] **Step 2: 生成 client。** Run: `npm run --workspace @lilink/api prisma:generate`（或 `cd apps/api && npx prisma generate`）。Expected: 生成成功，`User`/`InviteCode` 类型可用。

- [ ] **Step 3: 建迁移。** 若本地 DB 可用：`cd apps/api && npx prisma migrate dev --name add_invite_code`。Expected: 生成迁移并应用成功。
  - 若无 DB（docker 不可用）：用 `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_add_invite_code/migration.sql` 生成 SQL（手建目录与时间戳），不应用。迁移须含：建 `InviteCode` 表与 `code` 唯一索引、`InviteCode(isActive, createdAt)` 索引、`User.inviteCodeId` 列、`User(inviteCodeId)` 索引、FK 到 `InviteCode(id)` `ON DELETE RESTRICT`。

- [ ] **Step 4: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/generated 2>/dev/null; git add apps/api/prisma
git commit -m "feat(invite-code): add InviteCode model and User referral link"
```

---

## Phase 2 — InviteCode 后端模块（TDD）

### Task 2: 常量

**Files:**
- Create: `apps/api/src/modules/invite-code/constants.ts`
- Modify: `apps/api/src/common/validation/input-limits.ts`

- [ ] **Step 1: 写常量。** `constants.ts`：
```ts
// Unambiguous uppercase alphanumerics (no I, L, O, 0, 1).
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_GENERATION_MAX_ATTEMPTS = 8;
```
在 `input-limits.ts` 追加：
```ts
export const INVITE_CODE_OWNER_NAME_MAX_LENGTH = 100;
export const INVITE_CODE_MAX_INPUT_LENGTH = 64;
```

- [ ] **Step 2: Commit.**
```bash
git add apps/api/src/modules/invite-code/constants.ts apps/api/src/common/validation/input-limits.ts
git commit -m "feat(invite-code): add invite code constants"
```

### Task 3: Service — 码生成 + create（TDD）

**Files:**
- Create: `apps/api/src/modules/invite-code/invite-code.service.ts`
- Test: `apps/api/src/modules/invite-code/invite-code.service.spec.ts`

- [ ] **Step 1: 写失败测试（生成 + create）。** `invite-code.service.spec.ts`：
```ts
import { InviteCodeService } from './invite-code.service';
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from './constants';

describe('InviteCodeService', () => {
  beforeEach(() => jest.resetAllMocks());

  function makeTxPrisma(overrides: Record<string, unknown> = {}) {
    const tx = {
      inviteCode: { create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
    const prisma = { ...tx, $transaction: jest.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
    return { prisma, tx };
  }

  it('creates an invite code with generated format and writes audit in the same transaction', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.inviteCode.create.mockImplementation(({ data }: { data: { code: string; ownerName: string } }) =>
      Promise.resolve({ id: 'ic1', code: data.code, ownerName: data.ownerName, isActive: true, createdAt: new Date() }),
    );
    const service = new InviteCodeService(prisma as never);

    const result = await service.createInviteCode('  张三  ', 'admin-1');

    expect(result.ownerName).toBe('张三');
    expect(result.code).toHaveLength(INVITE_CODE_LENGTH);
    expect([...result.code].every((ch) => INVITE_CODE_ALPHABET.includes(ch))).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: { adminActorId: 'admin-1', action: 'invite_code.create', metadata: { inviteCodeId: 'ic1' } },
    });
  });

  it('retries generation on unique-collision (P2002)', async () => {
    const { prisma, tx } = makeTxPrisma();
    let calls = 0;
    tx.inviteCode.create.mockImplementation(({ data }: { data: { code: string } }) => {
      calls += 1;
      if (calls === 1) return Promise.reject({ code: 'P2002' });
      return Promise.resolve({ id: 'ic2', code: data.code, ownerName: 'x', isActive: true, createdAt: new Date() });
    });
    const service = new InviteCodeService(prisma as never);
    const result = await service.createInviteCode('x', 'admin-1');
    expect(calls).toBe(2);
    expect(result.id).toBe('ic2');
  });
});
```

- [ ] **Step 2: 跑测试看失败。** Run: `cd apps/api && npx jest invite-code.service --runTestsByPath src/modules/invite-code/invite-code.service.spec.ts`. Expected: FAIL（找不到模块/方法）。

- [ ] **Step 3: 实现 service（生成 + create）。** `invite-code.service.ts`：
```ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { HARD_MATCH_GENDERS, HARD_MATCH_KEYS, readSingleChoice } from '@lilink/shared';
import { Prisma } from '../../common/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_GENERATION_MAX_ATTEMPTS,
  INVITE_CODE_LENGTH,
} from './constants';

export interface InviteCodeStats {
  total: number;
  male: number;
  female: number;
  nonBinary: number;
  unknown: number;
}

@Injectable()
export class InviteCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createInviteCode(ownerName: string, adminActorId: string) {
    const trimmedName = ownerName.trim();
    if (!trimmedName) {
      throw new BadRequestException('Owner name is required.');
    }

    for (let attempt = 0; attempt < INVITE_CODE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
      const code = this.generateCandidateCode();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const created = await tx.inviteCode.create({
            data: { code, ownerName: trimmedName },
          });
          await tx.auditLog.create({
            data: {
              adminActorId,
              action: 'invite_code.create',
              metadata: { inviteCodeId: created.id },
            },
          });
          return this.toInviteCodeView(created);
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) continue;
        throw error;
      }
    }

    throw new InternalServerErrorException('Failed to generate a unique invite code.');
  }

  private generateCandidateCode() {
    let code = '';
    for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
      code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
    }
    return code;
  }

  private toInviteCodeView(record: {
    id: string;
    code: string;
    ownerName: string;
    isActive: boolean;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      code: record.code,
      ownerName: record.ownerName,
      isActive: record.isActive,
      createdAt: record.createdAt,
    };
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private isRecordNotFoundError(error: unknown) {
    return (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code?: unknown }).code === 'P2025'
    );
  }
}
```

- [ ] **Step 4: 跑测试看通过。** Run: 同 Step 2。Expected: PASS（2 用例）。

- [ ] **Step 5: Commit.**
```bash
git add apps/api/src/modules/invite-code/invite-code.service.ts apps/api/src/modules/invite-code/invite-code.service.spec.ts
git commit -m "feat(invite-code): generate codes and create with transactional audit"
```

### Task 4: Service — setInviteCodeActive（TDD）

**Files:** Modify service + spec（同上）

- [ ] **Step 1: 加失败测试。**
```ts
it('updates active state with transactional audit', async () => {
  const { prisma, tx } = makeTxPrisma();
  tx.inviteCode.update.mockResolvedValue({ id: 'ic1', code: 'ABCDEFGH', ownerName: 'x', isActive: false, createdAt: new Date() });
  const service = new InviteCodeService(prisma as never);
  const result = await service.setInviteCodeActive('ic1', false, 'admin-1');
  expect(result.isActive).toBe(false);
  expect(tx.auditLog.create).toHaveBeenCalledWith({
    data: { adminActorId: 'admin-1', action: 'invite_code.set_active', metadata: { inviteCodeId: 'ic1', isActive: false } },
  });
});

it('maps P2025 to NotFoundException', async () => {
  const { prisma, tx } = makeTxPrisma();
  tx.inviteCode.update.mockRejectedValue({ code: 'P2025' });
  const service = new InviteCodeService(prisma as never);
  await expect(service.setInviteCodeActive('missing', true, 'admin-1')).rejects.toThrow('Invite code not found.');
});
```

- [ ] **Step 2: 跑测试看失败。** Run: 同 Task3 Step2。Expected: FAIL。

- [ ] **Step 3: 实现方法（加入 service 类）。**
```ts
  async setInviteCodeActive(id: string, isActive: boolean, adminActorId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.inviteCode.update({ where: { id }, data: { isActive } });
        await tx.auditLog.create({
          data: {
            adminActorId,
            action: 'invite_code.set_active',
            metadata: { inviteCodeId: id, isActive },
          },
        });
        return this.toInviteCodeView(updated);
      });
    } catch (error) {
      if (this.isRecordNotFoundError(error)) {
        throw new NotFoundException('Invite code not found.');
      }
      throw error;
    }
  }
```

- [ ] **Step 4: 跑测试看通过。** Expected: PASS。
- [ ] **Step 5: Commit.** `git commit -am "feat(invite-code): activate/deactivate with audit"`

### Task 5: Service — resolveActiveCodeId（TDD）

- [ ] **Step 1: 加失败测试。**
```ts
describe('resolveActiveCodeId', () => {
  it('returns null for empty/whitespace', async () => {
    const { prisma } = makeTxPrisma();
    const service = new InviteCodeService(prisma as never);
    expect(await service.resolveActiveCodeId(undefined)).toBeNull();
    expect(await service.resolveActiveCodeId('   ')).toBeNull();
  });
  it('normalizes and returns id for active code', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.inviteCode.findUnique.mockResolvedValue({ id: 'ic1', isActive: true });
    const service = new InviteCodeService(prisma as never);
    expect(await service.resolveActiveCodeId(' abcdefgh ')).toBe('ic1');
    expect(tx.inviteCode.findUnique).toHaveBeenCalledWith({ where: { code: 'ABCDEFGH' } });
  });
  it('throws for missing or inactive code', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.inviteCode.findUnique.mockResolvedValueOnce(null);
    const service = new InviteCodeService(prisma as never);
    await expect(service.resolveActiveCodeId('NOPE1234')).rejects.toThrow('Invite code is invalid or inactive.');
    tx.inviteCode.findUnique.mockResolvedValueOnce({ id: 'ic2', isActive: false });
    await expect(service.resolveActiveCodeId('OFF12345')).rejects.toThrow('Invite code is invalid or inactive.');
  });
});
```
> 注：`makeTxPrisma` 的 `prisma` 直接含 `inviteCode.findUnique`（非事务），与 service 用 `this.prisma.inviteCode.findUnique` 一致。

- [ ] **Step 2: 跑测试看失败。** Expected: FAIL。
- [ ] **Step 3: 实现方法。**
```ts
  async resolveActiveCodeId(raw?: string | null): Promise<string | null> {
    if (!raw) return null;
    const code = raw.trim().toUpperCase();
    if (!code) return null;
    const found = await this.prisma.inviteCode.findUnique({ where: { code } });
    if (!found || !found.isActive) {
      throw new BadRequestException('Invite code is invalid or inactive.');
    }
    return found.id;
  }
```
- [ ] **Step 4: 跑测试看通过。** Expected: PASS。
- [ ] **Step 5: Commit.** `git commit -am "feat(invite-code): resolve active code for registration"`

### Task 6: Service — listInviteCodes + 统计分桶（TDD）

- [ ] **Step 1: 加失败测试（覆盖 isTest 剔除、草稿不计、未提交=unknown、空码全 0）。**
```ts
import { HARD_MATCH_KEYS } from '@lilink/shared';

describe('listInviteCodes stats', () => {
  it('buckets by submitted gender, excludes isTest, ignores drafts, defaults unknown', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.inviteCode.findMany.mockResolvedValue([
      { id: 'ic1', code: 'AAAA1111', ownerName: 'A', isActive: true, createdAt: new Date() },
      { id: 'ic2', code: 'BBBB2222', ownerName: 'B', isActive: true, createdAt: new Date() },
    ]);
    tx.inviteCode.count.mockResolvedValue(2);
    // ic1: male(submitted) + female(submitted) + unknown(not submitted) + (isTest excluded by query)
    tx.user.findMany.mockResolvedValue([
      { inviteCodeId: 'ic1', questionnaireResponse: { submittedAt: new Date(), answers: { [HARD_MATCH_KEYS.gender]: '男' } } },
      { inviteCodeId: 'ic1', questionnaireResponse: { submittedAt: new Date(), answers: { [HARD_MATCH_KEYS.gender]: '女' } } },
      { inviteCodeId: 'ic1', questionnaireResponse: { submittedAt: null, answers: {} } },
      { inviteCodeId: 'ic1', questionnaireResponse: null },
    ]);
    const service = new InviteCodeService(prisma as never);
    const page = await service.listInviteCodes({});
    const ic1 = page.items.find((i: { id: string }) => i.id === 'ic1');
    const ic2 = page.items.find((i: { id: string }) => i.id === 'ic2');
    expect(ic1.stats).toEqual({ total: 4, male: 1, female: 1, nonBinary: 0, unknown: 2 });
    expect(ic2.stats).toEqual({ total: 0, male: 0, female: 0, nonBinary: 0, unknown: 0 });
    // isTest must be filtered at query level:
    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isTest: false }),
    }));
  });
});
```

- [ ] **Step 2: 跑测试看失败。** Expected: FAIL。
- [ ] **Step 3: 实现 list + 统计。** 加入 service：
```ts
  async listInviteCodes(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'active' | 'inactive';
  }) {
    const page = this.normalizePositiveInt(query.page, 1, 10_000);
    const pageSize = this.normalizePositiveInt(query.pageSize, 20, 50);
    const skip = (page - 1) * pageSize;

    const where: Prisma.InviteCodeWhereInput = {};
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { ownerName: { contains: search, mode: 'insensitive' } },
        { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.isActive = true;
    else if (query.status === 'inactive') where.isActive = false;

    const [codes, total] = await Promise.all([
      this.prisma.inviteCode.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
      this.prisma.inviteCode.count({ where }),
    ]);

    const statsByCode = await this.computeStats(codes.map((c) => c.id));

    return {
      items: codes.map((c) => ({
        ...this.toInviteCodeView(c),
        stats: statsByCode.get(c.id) ?? this.emptyStats(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private emptyStats(): InviteCodeStats {
    return { total: 0, male: 0, female: 0, nonBinary: 0, unknown: 0 };
  }

  private async computeStats(inviteCodeIds: string[]): Promise<Map<string, InviteCodeStats>> {
    const result = new Map<string, InviteCodeStats>();
    for (const id of inviteCodeIds) result.set(id, this.emptyStats());
    if (inviteCodeIds.length === 0) return result;

    const users = await this.prisma.user.findMany({
      where: { inviteCodeId: { in: inviteCodeIds }, isTest: false },
      select: {
        inviteCodeId: true,
        questionnaireResponse: { select: { submittedAt: true, answers: true } },
      },
    });

    for (const user of users) {
      if (!user.inviteCodeId) continue;
      const bucket = result.get(user.inviteCodeId);
      if (!bucket) continue;
      bucket.total += 1;
      switch (this.resolveSubmittedGender(user.questionnaireResponse)) {
        case '男': bucket.male += 1; break;
        case '女': bucket.female += 1; break;
        case '非二元': bucket.nonBinary += 1; break;
        default: bucket.unknown += 1;
      }
    }
    return result;
  }

  private resolveSubmittedGender(
    response: { submittedAt: Date | null; answers: Prisma.JsonValue } | null,
  ) {
    if (!response?.submittedAt) return null;
    const answers = response.answers;
    if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return null;
    return readSingleChoice(
      (answers as Record<string, unknown>)[HARD_MATCH_KEYS.gender],
      HARD_MATCH_GENDERS,
    );
  }

  private normalizePositiveInt(value: number | undefined, fallback: number, max: number) {
    if (value == null || !Number.isSafeInteger(value) || value < 1) return fallback;
    return Math.min(value, max);
  }
```

- [ ] **Step 4: 跑测试看通过。** Run: `cd apps/api && npx jest --runTestsByPath src/modules/invite-code/invite-code.service.spec.ts`. Expected: PASS（全部用例）。
- [ ] **Step 5: Commit.** `git commit -am "feat(invite-code): list codes with live-derived gender stats"`

### Task 7: DTO + Controller + Module（装配）

**Files:** dto.ts / invite-code.controller.ts / invite-code.module.ts；Modify `app.module.ts`。

- [ ] **Step 1: dto.ts**
```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_MAX,
  ADMIN_SEARCH_MAX_LENGTH,
  INVITE_CODE_OWNER_NAME_MAX_LENGTH,
} from '../../common/validation/input-limits';

export class CreateInviteCodeDto {
  @IsString() @MinLength(1) @MaxLength(INVITE_CODE_OWNER_NAME_MAX_LENGTH)
  ownerName!: string;
}

export class ListInviteCodesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(ADMIN_LIST_PAGE_MAX)
  page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(ADMIN_LIST_PAGE_SIZE_MAX)
  pageSize?: number;
  @IsOptional() @IsString() @MaxLength(ADMIN_SEARCH_MAX_LENGTH)
  search?: string;
  @IsOptional() @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

export class SetInviteCodeActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
```

- [ ] **Step 2: controller**
```ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AdminAuthenticatedRequest } from '../../common/auth/admin.guard';
import { CreateInviteCodeDto, ListInviteCodesQueryDto, SetInviteCodeActiveDto } from './dto';
import { InviteCodeService } from './invite-code.service';

@Controller('admin/invite-codes')
@UseGuards(AdminGuard)
export class InviteCodeAdminController {
  constructor(private readonly inviteCodeService: InviteCodeService) {}

  @Get()
  list(@Query() query: ListInviteCodesQueryDto) {
    return this.inviteCodeService.listInviteCodes(query);
  }

  @Post()
  create(@Req() request: AdminAuthenticatedRequest, @Body() body: CreateInviteCodeDto) {
    return this.inviteCodeService.createInviteCode(body.ownerName, request.admin!.id);
  }

  @Patch(':id')
  setActive(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetInviteCodeActiveDto,
  ) {
    return this.inviteCodeService.setInviteCodeActive(id, body.isActive, request.admin!.id);
  }
}
```

- [ ] **Step 3: module**
```ts
import { Module } from '@nestjs/common';
import { InviteCodeAdminController } from './invite-code.controller';
import { InviteCodeService } from './invite-code.service';

@Module({
  controllers: [InviteCodeAdminController],
  providers: [InviteCodeService],
  exports: [InviteCodeService],
})
export class InviteCodeModule {}
```

- [ ] **Step 4: 注册到 app.module.ts。** 在 imports 数组加 `InviteCodeModule`（并 import）。

- [ ] **Step 5: 构建验证。** Run: `npm run --workspace @lilink/api build`（或 `cd apps/api && npx tsc -p tsconfig.build.json --noEmit`）。Expected: 编译通过。
- [ ] **Step 6: Commit.** `git commit -am "feat(invite-code): admin endpoints and module wiring"`

---

## Phase 3 — 注册集成

### Task 8: RegisterDto + AuthService 解析落库（TDD）

**Files:** `auth/dto.ts`, `auth/auth.service.ts`, `auth/auth.module.ts`, `auth/auth.service.spec.ts`。

- [ ] **Step 1: RegisterDto 加字段。** 在 `RegisterDto` 末尾：
```ts
  @IsOptional()
  @IsString()
  @MaxLength(INVITE_CODE_MAX_INPUT_LENGTH)
  inviteCode?: string;
```
并在 `auth/dto.ts` 顶部 import `INVITE_CODE_MAX_INPUT_LENGTH`（来自 `../../common/validation/input-limits`），确认已 import `IsOptional`。

- [ ] **Step 2: 更新 auth.service.spec.ts 实例化 + 加用例。** 现有测试 `new AuthService(prisma, mail, schoolResolver, jwt)` 需补第 5 个参数 mock。新增/调整：
```ts
const inviteCodeService = { resolveActiveCodeId: jest.fn().mockResolvedValue(null) };
// 所有 new AuthService(...) 调用末尾加 inviteCodeService as never
```
新增用例（沿用该文件既有 register 测试的 mock 风格）：
- 填有效码：`inviteCodeService.resolveActiveCodeId` 返回 `'ic1'` → `tx.user.create` 收到 `data.inviteCodeId === 'ic1'`。
- 填无效码：`resolveActiveCodeId` 抛 `BadRequestException` → register 抛错，且**验证码消费（`consumeVerificationCode`/`emailCode.updateMany`）未被调用**（断言 mock 未触发）。
- 不填：`resolveActiveCodeId('undefined' 路径)` 返回 null → `data.inviteCodeId` 为 null。

- [ ] **Step 3: 跑测试看失败。** Run: `cd apps/api && npx jest --runTestsByPath src/modules/auth/auth.service.spec.ts`. Expected: FAIL。

- [ ] **Step 4: 改 AuthService。**
  - import：`import { InviteCodeService } from '../invite-code/invite-code.service';`
  - 构造函数末尾加：`private readonly inviteCodeService: InviteCodeService,`
  - `register` 内，在 `await this.assertVerificationCodeIsValid(...)` 之后、`argon2.hash` 之前加：
    ```ts
    const inviteCodeId = await this.inviteCodeService.resolveActiveCodeId(input.inviteCode);
    ```
  - `tx.user.create` 的 `data` 内加：`inviteCodeId: inviteCodeId,`（紧邻 `schoolId`）。

- [ ] **Step 5: auth.module.ts import 模块。** `imports: [JwtModule.register({...}), InviteCodeModule]`，并 `import { InviteCodeModule } from '../invite-code/invite-code.module';`。

- [ ] **Step 6: 跑测试看通过。** Run: 同 Step3 + invite-code spec。Expected: PASS。
- [ ] **Step 7: 构建验证。** Run: `npm run --workspace @lilink/api build`. Expected: 通过。
- [ ] **Step 8: Commit.** `git commit -am "feat(auth): accept optional invite code at registration"`

---

## Phase 4 — Web

### Task 9: 类型 + 错误翻译

**Files:** `apps/web/src/app/admin/types.ts`, `apps/web/src/lib/api.ts`。

- [ ] **Step 1: types.ts 加类型。**
```ts
export type AdminInviteCode = {
  id: string;
  code: string;
  ownerName: string;
  isActive: boolean;
  createdAt: string;
  stats: { total: number; male: number; female: number; nonBinary: number; unknown: number };
};
```
- [ ] **Step 2: api.ts 错误翻译。** 在英→中映射表加：`"Invite code is invalid or inactive.": "邀请码无效或已停用。"`（沿用该文件既有映射写法/键名风格）。
- [ ] **Step 3: web typecheck。** Run: `npm run --workspace @lilink/web typecheck`（若无该脚本则 `cd apps/web && npx tsc --noEmit`）。Expected: 通过。
- [ ] **Step 4: Commit.** `git commit -am "feat(web): invite code admin type and error copy"`

### Task 10: 后台「邀请码」页 + 导航

**Files:** Create `apps/web/src/app/admin/invite-codes/page.tsx`；Modify `admin-layout-shell.tsx`。

- [ ] **Step 1: 导航。** 在 `admin-layout-shell.tsx` 的 `NAV` 数组合适位置加：`{ href: "/admin/invite-codes", label: "邀请码" }`。
- [ ] **Step 2: 页面。** 仿照 `apps/web/src/app/admin/schools/page.tsx` 的结构（`"use client"` + `useAdminCollection` + `fetchApi` + 分页 + 搜索）。要点：
  - `const { data, loading, error, refresh } = useAdminCollection<AdminInviteCode>("/admin/invite-codes", { page, pageSize: 20, search: submittedSearch, status });`
  - 创建表单：输入 `ownerName` → `await fetchApi("/admin/invite-codes", { method: "POST", body: JSON.stringify({ ownerName }) })` → 把返回的 `code` 展示在"最新生成"区（便于复制）→ `await refresh()`。
  - 列表表格列：`code`、`ownerName`、状态（按钮切换：`fetchApi(\`/admin/invite-codes/${id}\`, { method: "PATCH", body: JSON.stringify({ isActive: !item.isActive }) })` 后 `refresh()`）、统计五列 `stats.total / male / female / nonBinary / unknown`（中文表头：总数/男/女/非二元/未填问卷）。
  - 状态筛选下拉：全部/active/inactive。
  - 错误用 `instanceof Error ? e.message : "操作失败。"`。
- [ ] **Step 3: web build/typecheck。** Run: `npm run --workspace @lilink/web typecheck`. Expected: 通过。
- [ ] **Step 4: Commit.** `git commit -am "feat(web): admin invite codes page"`

### Task 11: 注册表单加邀请码输入

**Files:** `apps/web/src/app/register/register-page-client.tsx`。

- [ ] **Step 1: 加状态与输入。** 新增 `const [inviteCode, setInviteCode] = useState("");` 与第二步表单里一个**选填**输入框（label 注明"邀请码（选填）"）。
- [ ] **Step 2: 并入提交体。** 在 `fetchApi("/auth/register", { ... body: JSON.stringify({ ... }) })` 的 body 中，加 `inviteCode: inviteCode.trim() || undefined`（空则不发）。
- [ ] **Step 3: typecheck。** Run: `npm run --workspace @lilink/web typecheck`. Expected: 通过。
- [ ] **Step 4: Commit.** `git commit -am "feat(web): optional invite code field on register"`

---

## Phase 5 — 整体验证

### Task 12: 全量校验

- [ ] **Step 1: shared 构建（如有改动）。** Run: `npm run build:shared`. Expected: 通过（预计无 shared 改动）。
- [ ] **Step 2: API 测试。** Run: `cd apps/api && npx jest --runTestsByPath src/modules/invite-code/invite-code.service.spec.ts src/modules/auth/auth.service.spec.ts`. Expected: 全 PASS。
- [ ] **Step 3: API 构建。** Run: `npm run --workspace @lilink/api build`. Expected: 通过。
- [ ] **Step 4: Web 校验。** Run: `npm run --workspace @lilink/web typecheck`（及 `build`，若环境允许）。Expected: 通过。
- [ ] **Step 5: 迁移可应用性（若 DB 可用）。** Run: `cd apps/api && npx prisma migrate status`. Expected: 迁移已记录/可应用。
- [ ] **Step 6: codex 代码评审循环。** 用 `codex exec review`/`codex exec` 对本分支改动评审，按反馈修正，直至无问题（见下）。

---

## codex 代码评审循环（实现后）

实现完成后，对整支分支做 codex 评审并迭代修复直到无问题：
1. `codex exec --sandbox read-only -C <worktree> "评审 feat/invite-code-system 相对 main 的全部改动……"`（对照 spec 与 §15 决议）。
2. 逐条评估：真问题→修；过度设计→记录理由回应。
3. 修复后重跑相关测试/构建，再次评审，直到 codex 无新增有效问题。

---

## Self-Review（写完计划后自查）

- [ ] **Spec 覆盖**：§4 数据模型→Task1；§5 生成→Task2-3；§6 模块/审计→Task3-7；§7 API→Task7；§8 统计→Task6；§9 注册→Task8；§10 前端→Task9-11；§12 测试→分散在 Task3-8 + Task12；§13 验证→Task12。✓
- [ ] **占位符**：无 TBD/TODO；非显然代码均给出。`<ts>` 为迁移时间戳占位（合理）。
- [ ] **类型一致**：service 方法名 `createInviteCode/setInviteCodeActive/resolveActiveCodeId/listInviteCodes/computeStats/resolveSubmittedGender`；stats 键 `total/male/female/nonBinary/unknown`；动作名 `invite_code.create`/`invite_code.set_active` —— 全文一致。
