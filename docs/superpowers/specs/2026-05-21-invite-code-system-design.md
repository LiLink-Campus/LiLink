# 邀请码系统设计（Invite Code System）

- 日期：2026-05-21
- 分支：`feat/invite-code-system`（基于 `main`，独立工作树 `../LiLink-invite-code`）
- 状态：已与用户确认方案；已过 codex 第 1 轮评审并据此修订；待实施

## 1. 背景与目标

招募一批"发传单"的同学（下称**拉新人 / recruiter**）帮忙推广。运营者（管理员）需要：

1. 在后台为某个拉新人填写姓名，系统**随机生成一个邀请码**，建立"姓名 ↔ 邀请码"映射。该映射**仅后台可见，绝不下发给注册用户**。
2. 新用户注册时**可选**填写邀请码，把该用户归属到对应拉新人。
3. 统计每个拉新人拉到的人头，并按注册用户**填写问卷后的性别**（男 / 女 / 非二元）分三类计入，另加"未填问卷（性别未知）"一类。

## 2. 范围

### 实现（v1）
- 后台：创建拉新人（填姓名→生成码）、列表查看每码统计、停用 / 启用某邀请码。
- 注册：可选邀请码字段，校验有效性并落库归属。
- 统计：每码展示 `总数 / 男 / 女 / 非二元 / 未填问卷`。
- 审计：创建与停用 / 启用记入 `AuditLog`（与状态变更在同一事务内）。

### 非目标（v1 不做）
- 邀请码重命名 / 删除（仅停用）。
- 面向注册用户公开的"邀请码校验 / 查询拉新人"接口（避免泄露映射）。
- 拉新人自助登录 / 自助看数据（纯后台运营视角）。
- 单个邀请码下注册用户名单的明细下钻（仅聚合人头；后续可加）。
- 角色/权限分层（RBAC）：本应用 `AdminOperator` 无角色概念，"仅后台可见"= 所有已认证 admin 可见，详见 §15。

## 3. 关键约束：性别在注册时还不知道

性别的权威来源是问卷回答 `QuestionnaireResponse.answers["hard_gender"]`（取值 `男 / 女 / 非二元`，定义于 `@lilink/shared` 的 `HARD_MATCH_GENDERS` 与 `HARD_MATCH_KEYS.gender`）。用户注册那一刻尚未填问卷，因此性别只能在问卷提交后才确定。

**采用方案 A（实时派生，用户已确认）**：注册时只在 `User` 上记录归属的邀请码（`inviteCodeId`，注册后不可变）。后台读取统计时实时关联用户问卷回答现算性别分桶。

- 优点：单一数据源、不漂移、**跟随用户最近一次"已提交"的问卷答案**、无需侵入问卷提交流程。
- 重要语义（已对照 `account.service.ts` 草稿保存逻辑核实）：草稿保存只写 `draftAnswers`，不动 `answers` 与 `submittedAt`；因此统计始终反映**最近一次成功提交**的性别，未提交草稿的改动不影响。
- 代价：读取时在内存按页分桶；管理后台数据量级（百到数千）下可忽略，性能边界见 §8。

被否决：方案 B（提交问卷时写性别快照，需挂钩同步且会漂移）、方案 C（行内计数器，最易算错）。

## 4. 数据模型（Prisma + 迁移）

### 新增 `InviteCode`
```prisma
model InviteCode {
  id        String   @id @default(cuid())
  code      String   @unique          // 规范化后的明文码（大写无歧义字母数字）
  ownerName String                    // 拉新人姓名，仅后台可见
  isActive  Boolean  @default(true)   // 停用后注册不可再用；历史归属保留
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  referrals User[]   @relation("UserInviteCode")

  @@index([isActive, createdAt])
}
```

### `User` 增加归属字段
```prisma
  inviteCodeId String?
  inviteCode   InviteCode? @relation("UserInviteCode", fields: [inviteCodeId], references: [id], onDelete: Restrict)
  // 新增索引
  @@index([inviteCodeId])
```

- `onDelete: Restrict`：保护历史归属——只要某码下还有注册用户，就不允许删除该码（v1 本就不删码，仅停用）。这比 `SetNull` 更能贯彻"历史归属保留"的运营预期，避免误删静默清空归属。
- 归属在注册时一次性写入，用户侧无任何读写入口。
- 新建一条 Prisma migration（`apps/api/prisma/migrations/`）。

## 5. 邀请码生成

- 字母表：去除易混字符的大写字母数字 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（去掉 `I L O 0 1`）。
- 长度：8 位（约 31^8 ≈ 8.5×10^11，碰撞与暴力枚举概率均可忽略）。
- 随机：使用 `crypto.randomInt(0, alphabet.length)` 逐位取，避免取模偏置。
- 唯一性：依赖 DB `@unique`；生成后 `create` 若命中 `P2002` 则重试（上限若干次后抛 500，正常不会触发）。
- 输入规范化：`code.trim().toUpperCase()`，统一存储与查询口径。

## 6. 后端模块结构

新增独立模块 `apps/api/src/modules/invite-code/`，职责单一、边界清晰：

```
invite-code/
  invite-code.module.ts       // providers:[InviteCodeService] controllers:[InviteCodeAdminController] exports:[InviteCodeService]
  invite-code.controller.ts   // @Controller('admin/invite-codes') @UseGuards(AdminGuard)
  invite-code.service.ts      // 生成/创建/列表+统计/停用启用/注册解析
  dto.ts                      // CreateInviteCodeDto / ListInviteCodesQueryDto / SetInviteCodeActiveDto
  constants.ts                // 字母表、长度、生成重试上限等
  invite-code.service.spec.ts // 单测
```

- `PrismaService` 全局可用（`PrismaModule` 为 `@Global`），模块无需显式 import。
- `AdminGuard`（`common/auth/admin.guard.ts`）依赖全局 `JwtService` 与 `PrismaService`，`@UseGuards` 直接可用。
- **审计写入（与状态变更同事务）**：`AdminAuditService.write()` 仅 `prisma.auditLog.create` 薄封装且未从 AdminModule 导出。为避免 `InviteCodeModule → AdminModule`（含 CyclesModule）的重耦合，在 `InviteCodeService` 内内联写入审计；且**创建 / 启停操作与对应 `auditLog.create` 放在同一个 `prisma.$transaction` 内**，杜绝"状态已变更但审计写入失败"的不可追责窗口（这是相对现有 admin 非事务审计的有意改进）。
  - 动作名：`invite_code.create`、`invite_code.set_active`。
  - **审计 metadata 只存 `inviteCodeId`（及 set_active 的目标 `isActive`）**，绝不写入 `ownerName`/`code` 完整映射——`AuditLog` 列表对 `metadata::text` 做 ILIKE 搜索，写入完整映射会把私密关系泄进可搜索审计文本。
- 在 `apps/api/src/app.module.ts` 注册 `InviteCodeModule`。
- `AuthModule` 增加 `imports:[InviteCodeModule]`，`AuthService` 注入 `InviteCodeService` 做注册期校验。无环依赖（InviteCodeModule 不依赖 AuthModule）。

## 7. 后台 API（均 `AdminGuard` 保护）

### `POST /admin/invite-codes`
- Body：`{ ownerName: string }`（trim 非空、长度上限沿用通用输入限制）。
- 行为：生成唯一码 →（事务内）创建记录 + 写审计 `invite_code.create`。
- 返回：`{ id, code, ownerName, isActive, createdAt }`（含明文码，供管理员发给拉新人）。

### `GET /admin/invite-codes`
- Query：`page?`, `pageSize?`, `search?`（按 `ownerName` 或 `code` 模糊匹配，大小写不敏感）, `status?`（`active` | `inactive` | 省略=全部）。
- 行为：分页取码，再对本页码 ID 关联用户问卷聚合统计（见 §8）。
- 返回（沿用分页结构 `{ items, total, page, pageSize, totalPages }`），`items[]` 形如：
```ts
{
  id: string;
  code: string;
  ownerName: string;
  isActive: boolean;
  createdAt: string;
  stats: { total: number; male: number; female: number; nonBinary: number; unknown: number };
}
```
- 统计键用稳定英文（`male/female/nonBinary/unknown`），前端再映射中文标签，避免中文对象键。

### `PATCH /admin/invite-codes/:id`
- Body：`{ isActive: boolean }`。
- 行为：（事务内）更新状态 + 写审计 `invite_code.set_active`（metadata 含 `inviteCodeId` 与目标 `isActive`）。
- 返回：更新后的记录。
- 找不到（Prisma `P2025`）→ 映射为 404。

## 8. 统计口径（实时派生）

对一页内的邀请码：
1. `prisma.user.findMany({ where:{ inviteCodeId:{ in: pageIds }, isTest: false }, select:{ inviteCodeId:true, questionnaireResponse:{ select:{ submittedAt:true, answers:true } } } })`。
2. 按 `inviteCodeId` 分桶，每个用户判定：
   - 若 `questionnaireResponse?.submittedAt` 非空，且 `answers` 为对象，取 `readSingleChoice(answers[HARD_MATCH_KEYS.gender], HARD_MATCH_GENDERS)`：
     - `男` → `male`，`女` → `female`，`非二元` → `nonBinary`；
     - 解析为 null（异常）→ `unknown`。
   - 否则（无问卷 / 未提交）→ `unknown`。
3. `total = male + female + nonBinary + unknown`，等于该码下**非测试**注册用户总数。
4. 无任何注册用户的码，统计全 0。

**口径定义（据 codex 评审补充）**：
- **排除 `isTest = true`**：测试账号不是真实人头，所有计数一律剔除。
- **不按 `UserStatus` 过滤**：`PENDING/ACTIVE/SUSPENDED` 均计入——它们都是被拉来的真实用户（注册流程将 referral 用户置为 `ACTIVE`，被封禁后仍是已招募人头）。

**性能边界（据 codex 评审写明）**：本方案把"本页码下的全部 referral 用户 + 其问卷 `answers`"取进内存分桶，查询规模随 `pageSize`（≤50）与单码 referral 数线性增长。百~数千 referral 量级完全够用；若未来单页 referral 逼近万级，再改为 SQL 内 JSON 聚合 / 物化统计 / 提交时快照。v1 不提前优化。

`HARD_MATCH_GENDERS`、`HARD_MATCH_KEYS`、`readSingleChoice` 均从 `@lilink/shared` 引入，复用既有定义，不另造常量。

## 9. 注册集成（`apps/api/src/modules/auth`）

### DTO（`auth/dto.ts` 的 `RegisterDto`）
新增可选字段：
```ts
@IsOptional()
@IsString()
@MaxLength(INVITE_CODE_MAX_INPUT_LENGTH) // 宽松上限，足够容纳规范化前输入
inviteCode?: string;
```

### `AuthService.register` 改动
- 解析时机：在 `assertVerificationCodeIsValid`（预检、未消费邮箱验证码）之后、进入 `$transaction` 之前调用 `inviteCodeService.resolveActiveCodeId(input.inviteCode)`。这样**邀请码输错不会消耗邮箱验证码**（良好 UX）。
- `resolveActiveCodeId(raw?: string): Promise<string | null>`：
  - `raw` 为空 / 仅空白 → 返回 `null`（视为未填，不归属）。
  - 规范化后 `findUnique({ where: { code } })`，再检查 `isActive`（注意 `code` 是唯一列、`(code,isActive)` 不是复合唯一，故用 `findUnique` 后判 active，而非对非唯一组合用 `findUnique`）：命中且 active→返回 `id`；不存在或已停用→抛 `BadRequestException('Invite code is invalid or inactive.')`。
- 将解析得到的 `inviteCodeId` 传入事务内 `tx.user.create({ data:{ ..., inviteCodeId } })`。

### 安全：枚举与竞态（据 codex 评审写明）
- **枚举 oracle（已接受的低风险）**：错误邀请码会在事务前抛错且不消费验证码，理论上让 `/auth/register` 成为"邀请码是否有效"的探针。判定为**低风险并接受**，理由：① 邀请码 8 位、字母表 31、不可猜；② 到达该校验需先持有针对受信任校域邮箱、未消费且未过期的邮箱验证码（需控制对应邮箱）；③ `/auth/register` 已有 `@Throttle(createPublicAuthThrottle('register'))` 限流；④ 仅泄露"码是否存在/有效"，**绝不泄露 owner 映射**。v1 **不**新增邀请码维度限流（过度设计）。
- **停用竞态（语义写明）**：解析在事务外完成，与 `user.create` 之间若码被停用，FK 仍指向该（现已停用）码行——**归属正确**。停用语义为"退役/不再追溯"，仅阻止**新的**解析，不影响既有引用或已通过解析的并发注册，无完整性问题。v1 不做事务内重锁。
- 注册响应不变，**不返回任何 owner / 邀请码信息**。

## 10. 前端

### 后台「邀请码」页
- 新增 `apps/web/src/app/admin/invite-codes/page.tsx`：
  - 顶部创建表单：输入姓名 → 提交 `POST /admin/invite-codes` → 展示返回的明文码（便于复制发给拉新人）。
  - 列表：复用 `useAdminCollection<AdminInviteCode>("/admin/invite-codes", { page, pageSize, search, status })`；列含 码 / 姓名 / 状态切换（调 `PATCH`）/ 统计五列（总数·男·女·非二元·未填问卷）。
  - 搜索框 + 状态筛选 + 分页，沿用 schools 页交互模式。
- 在 `apps/web/src/app/admin/admin-layout-shell.tsx` 的 `NAV` 增加 `{ href: "/admin/invite-codes", label: "邀请码" }`。
- 在 `apps/web/src/app/admin/types.ts` 增加 `AdminInviteCode` 类型（含 `stats`）。

### 注册表单
- `apps/web/src/app/register/register-page-client.tsx` 第二步增加**可选**「邀请码」输入框（注明选填），提交时把规范化后的 `inviteCode` 并入 `fetchApi("/auth/register", ...)` 的 body。
- 空值不提交该字段（或提交空字符串由后端按未填处理）。

### 错误文案翻译
- 后端固定英文消息 `Invite code is invalid or inactive.`；在 `apps/web/src/lib/api.ts` 错误翻译表加映射 → `邀请码无效或已停用。`。

## 11. 边界与细节

- 同名拉新人允许重复（不对 `ownerName` 唯一约束）；每次创建生成新码。
- 邀请码大小写不敏感（统一大写存储与查询）。
- 停用码：注册解析失败（按无效处理）；已归属的历史用户不受影响、仍计入该码统计。
- 性别"未知"既覆盖"未填问卷"，也兜底"已提交但 `hard_gender` 异常不可解析"（极少）。
- 统计排除 `isTest=true`；不按状态过滤（见 §8 口径）。
- 列表统计按"本页码"聚合，查询规模受分页约束（见 §8 性能边界）。

## 12. 测试

- `invite-code.service.spec.ts`（mock Prisma，沿用现有 service spec 风格）：
  - 码生成：格式（长度/字母表）、`P2002` 碰撞后重试成功。
  - `create`：返回明文码、（事务内）写审计、metadata 仅含 `inviteCodeId`。
  - `setActive`：状态更新、写审计、不存在（`P2025`）→ 404。
  - 列表统计分桶：混合（已提交各性别 / 未提交 / 无问卷 / `isTest=true`）→ `male/female/nonBinary/unknown/total` 正确，且 `isTest` 被剔除；空码全 0。
  - **草稿不影响**：已提交某性别后又保存改了性别的未完成草稿（只写 `draftAnswers`）→ 统计仍按旧的已提交答案。
  - `resolveActiveCodeId`：空→null；有效→id；不存在/停用→抛错；大小写与空白规范化。
- 注册：在既有 auth 测试位置补充——填有效码→落 `inviteCodeId`；填无效/停用码→抛错且**不消费邮箱验证码**；不填→`inviteCodeId` 为 null。

## 13. 验证步骤

1. 构建 `@lilink/shared`（若改动 shared；本设计预计复用现有导出，可能无改动）。
2. `prisma generate`（schema 变更后）。
3. API 构建 + 运行 `invite-code` 与 auth 相关单测。
4. web typecheck / build，覆盖新后台页与注册表单。
5. 迁移：在本地 DB 跑 migrate 验证 schema 变更可应用。

## 14. 变更文件清单（预期）

**API**
- `apps/api/prisma/schema.prisma`（+`InviteCode`，`User` 加字段/索引）
- `apps/api/prisma/migrations/<ts>_add_invite_code/migration.sql`（新）
- `apps/api/src/modules/invite-code/*`（新模块全套）
- `apps/api/src/modules/auth/dto.ts`（+`inviteCode`）
- `apps/api/src/modules/auth/auth.service.ts`（解析+落库）
- `apps/api/src/modules/auth/auth.module.ts`（import InviteCodeModule）
- `apps/api/src/app.module.ts`（注册 InviteCodeModule）
- `apps/api/src/common/validation/input-limits.ts`（若需新增长度常量）

**Web**
- `apps/web/src/app/admin/invite-codes/page.tsx`（新）
- `apps/web/src/app/admin/admin-layout-shell.tsx`（NAV +1）
- `apps/web/src/app/admin/types.ts`（+`AdminInviteCode`）
- `apps/web/src/app/register/register-page-client.tsx`（+邀请码输入）
- `apps/web/src/lib/api.ts`（+错误翻译）

**Shared**
- 预计无改动（复用 `HARD_MATCH_GENDERS` / `HARD_MATCH_KEYS` / `readSingleChoice`）。

## 15. 评审决议（codex 第 1 轮）

记录对 codex 评审 10 条的处置，作为实现依据：

| # | 严重度 | 主题 | 处置 |
|---|---|---|---|
| 1 | 高→低 | 注册成邀请码有效性 oracle | **接受为低风险**：码不可猜 + 已限流 + 仅泄露存在性 + 不泄露映射；保留事务前校验（好 UX）；**不**加邀请码维度限流（过度设计）。见 §9。 |
| 2 | 高 | 审计应与变更同事务、metadata 勿含完整映射 | **采纳**：create/set_active 与 `auditLog.create` 同 `$transaction`；metadata 仅 `inviteCodeId`(+`isActive`)。见 §6。 |
| 3 | 中 | AdminGuard 无 RBAC | **文档澄清**：本应用无角色分层，"仅后台可见"= 所有 active admin 可见；RBAC 超 v1 范围。见 §2/§15。**不**引入 RBAC。 |
| 4 | 中 | 分页统计仍把整页 referral 拉内存 | **文档写明性能边界**与升级路径；v1 不提前优化。见 §8。 |
| 5 | 中 | "自动跟随性别"实为"仅已提交" | **采纳措辞修正**：跟随最近一次已提交答案；草稿不影响；补测试。见 §3/§12。 |
| 6 | 中 | 未定义是否计入 SUSPENDED / isTest | **采纳口径**：排除 `isTest=true`；不按状态过滤（全部真实用户计入）。见 §8。 |
| 7 | 中 | 解析后停用前仍归属的竞态 | **文档写明语义**：停用不追溯、仅阻新解析；**不**做事务内重锁。见 §9。 |
| 8 | 低 | `onDelete: SetNull` 与"历史保留"冲突 | **采纳**：改 `onDelete: Restrict`。见 §4。 |
| 9 | 低 | `findUnique` 误用于非唯一组合 | **采纳**：`findUnique({where:{code}})` 后判 `isActive`。见 §9。 |
| 10 | 低 | 文档尾部残留标签 | **采纳**：已清理。 |
