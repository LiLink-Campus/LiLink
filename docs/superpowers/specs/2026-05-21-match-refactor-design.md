# 匹配功能大重构设计 (2026-05-21)

> 修订记录：v2 已纳入 Codex 第一轮 review 的全部 BLOCKING/NICE-TO-HAVE 修正（见 §13）。

## 1. 背景与目标

LiLink 当前匹配链路依赖 DeepSeek 生成「匹配理由 (reason/reasons)」与「聊天话题 (conversationTopics)」，并用 `MatchNarrativeSource` 记录来源；理由文本由问卷 `Question.reasonRules` 驱动的启发式规则生成。产品决定**彻底移除**这套能力，改为在匹配揭晓后直接展示对方客观信息，并允许用户对参与过的匹配填写反馈评价（仅平台/管理员可见）。

三件事：

1. 完全移除 DeepSeek narrative 能力。
2. 完全移除「匹配理由」与「聊天话题」能力（含 `Question.reasonRules` 规则引擎与 admin 编辑器）。
3. dashboard match 页面：揭晓后展示对方「本人性别 / 性别偏好 / 本周交友意向」，新增「填写本次反馈评价」入口；引荐邮件同步重构为展示同样的对方信息。

①②同属一条管线（narrative 服务与启发式 reasonRules 共同产出 reason/topics），合并处理；③为新增能力。

## 2. 范围

**In scope**
- 删除 narrative 服务、reasonRules 规则引擎、相关 Prisma 字段/枚举、配置、API/DTO、前端组件（含历史列表）、邮件段落、seed 脚本、测试。
- match 卡片与历史列表展示对方 `gender` / `partnerGenders` / `weeklyIntent`，揭晓后（VISIBLE）即显示。
- 新增 `MatchFeedback` 模型与 `PUT /me/matches/:matchId/feedback` 端点；match 页与历史列表填写入口。
- 引荐邮件重构：去掉 reason/topics，改为按收件人视角展示对方 `gender` / `partnerGenders` / `weeklyIntent`。
- admin 匹配列表附带双方 feedback（admin-only）。
- 数据库迁移：删列删枚举、新建反馈表；**保留所有历史 Match / MatchParticipant 行**。
- 相关单测/e2e 更新。

**Out of scope**
- 反馈的双向互评 / 对方可见：反馈仅平台与管理员可见。
- 匹配算法**打分**不变（仅删除「理由文本」生成，保留 `scorePair` 的 score 计算）。
- `apps/web/src/app/page.tsx` 的 `matchesLabelIsNarrative` 与 DeepSeek 无关（仅文案命名巧合），**不改动**。

## 3. 现状关键事实（实现依据，含行号）

- **Dashboard 匹配数据来自冻结快照**：`UserCycleDashboardSnapshot` 存 `SnapshotPayload` JSON；`dashboard-snapshot.service.ts` 的 `dashboardSnapshotMatchSelect`（34-89）决定从 `Match` 拉取的字段，当前含 `reasons/reason/conversationTopics` 及 participants；participant 已含 `user.questionnaireResponse.answers`（80-84）。
- **三条快照同步路径**全部汇聚到 `buildSnapshotPayload`（638）→ `buildMatchPayload`（708-766）：
  - `syncCycleSnapshotsDirect`（354）：加载**全 cycle** participations（select 仅 `userId/status`，374-380）。
  - `syncUserCycleSnapshotDirect`（423）：**仅加载当前用户**的 participation（446-457）——counterpart 的 intent 不可得（Codex BLOCKING）。
  - `syncMatchSnapshotsDirect`（521）：加载 match 全 participants 的 participations（547-559）。
  - `buildSnapshotsForCycle`（606）汇总。
- **本周意向**：三处 participation select 均未含 `intent`，需补；并保证 counterpart 的 intent 在所有路径可得。
- **LIMITED 隐私**：`buildMatchPayload` 在 `hideSensitiveFields` 时 participants 置空、reasons/topics 置空。
- **reason 生成在 cycles.service.ts**：`scorePair`（2092）返回 `{ score, reasons }`（2317）；`buildReasonMessages`（2324）用 `Question.reasonRules` 生成理由文本；`normalizeStoredReasons`（2552）读存储理由；写入 Match 在 1816；预览返回 `reasons` 在 700/1390/1398；select `reasons` 在 2850。**不存在** `buildHeuristicReasons`。
- **reasonRules 波及面**：schema `Question.reasonRules`（schema.prisma:292）；cycles.service 引用（139/144/250/275，`normalizeQuestionReasonRules`）；admin DTO（admin/dto.ts:264）；web admin types（admin/types.ts:47）；admin 问卷编辑器（admin-questionnaire-client.tsx 约 25 处，含编辑面板 682+ 与计数 949-951）；`seed-defaults.mjs` 多条；测试（admin.service.spec、account.service.spec）。**reasonRules 仅驱动理由文本，不影响 score。**
- **引荐邮件**：`mail.service.ts` 的 `IntroductionEmailInput`（18-36）含 `requester`/`recipient` 两个对象 + 顶层 `reason`/`conversationTopics`；`buildIntroductionEmails`（257-）为双方各生成一封并传 `otherParty`；`account.service.ts`（2011-）从各自 `user.questionnaireResponse.answers` 填充 requester/recipient。
- **admin 匹配**：`GET /admin/cycles/:cycleId/matches`（admin.controller.ts:125）→ `getCycleMatches`（admin.service.ts ~825）select+normalize reasons/reason/conversationTopics（839-841、876-894）；admin 预览页渲染 `pair.reasons`（admin/cycles/page.tsx:939）。
- **历史列表**：`MatchHistoryList.tsx`（import:9，渲染:102-106）使用 `MatchExplanation` 传 reason/reasons/conversationTopics；历史项类型为 `DashboardHistoryItem.match: DashboardMatch`。
- **seed 脚本**：`seed-history.mjs`（86-89/108-110/172-175/253-255）、`seed-meetup-demo.mjs`（379-390/430-432）写 reasons/reason/conversationTopics/narrativeSource。
- **硬匹配解析**：`packages/shared` 的 `HARD_MATCH_KEYS`（`gender→hard_gender`、`partnerGenders→hard_partner_genders`）；性别值为中文（男/女/非二元）。

## 4. 设计 A — 删除 narrative + 匹配理由 + 聊天话题（含 reasonRules）

### 后端
- 删除文件 `match-narrative.service.ts` 及其 spec。
- `cycles.service.ts`：移除 `MatchNarrativeService` 注入与全部 narrative 逻辑；删除 `buildReasonMessages`、`normalizeStoredReasons`、`normalizeQuestionReasonRules` 引用及 `reasonRules` 相关类型字段（119/139/144/193/250/275）；`scorePair` 改为只返回 `score`（删 2124/2183/2226/2276/2317 的 reasons 累积）；建匹配不再写 `reason/reasons/conversationTopics/narrativeSource`（1816）；预览输出删 `reasons`（700/1390/1398）；select 删 `reasons`（2850）。
  - **行为变化**：cycle 状态机不再因 pending narrative 阻塞，揭晓在匹配计算后即推进；删除/改写依赖该等待的测试。
- `cycles.module.ts`：移除 provider。
- `dashboard-snapshot.service.ts`：select 与 `buildMatchPayload` 删 `reasons/reason/conversationTopics` 及 normalize 调用。
- `common/dashboard/match-metadata.ts`：删除 reason/topics normalize 函数（确认无残留引用后删文件）。
- `account.service.ts`：删 `defaultConversationTopics()`；引荐邮件输入改造（见 §7）。
- `admin.service.ts`：`getCycleMatches` 删 reasons/reason/conversationTopics 的 select 与 normalize（改为附带 feedback，见 §6）。
- `dto.ts`：`DashboardMatchResponseDto` 删 `reasons/reason/conversationTopics`；admin matches DTO 同步。
- **reasonRules 全删**（完整链路）：
  - `schema.prisma` 删 `Question.reasonRules`。
  - `apps/api/src/modules/questionnaire/questionnaire-config.ts`：删 `QUESTION_REASON_RULE_TYPES`（4-7）与 `normalizeQuestionReasonRules`（167-210）。
  - `apps/api/src/modules/questionnaire/questionnaire.service.ts`：公共问卷 payload 不再 import/返回 `reasonRules`（14/25/54/136）。
  - `cycles.service.ts`：删 `normalizeQuestionReasonRules` 引用（250/275）及相关类型字段。
  - `admin/dto.ts` 删 `reasonRules`（264）；admin.service 问卷读写不再处理 reasonRules。
  - admin 问卷编辑器 `admin-questionnaire-client.tsx` + `admin/types.ts`（47）：删表单状态、增删改 UI、校验、计数徽标。
  - seed：`apps/api/prisma/seed.ts`（248-259/532-547/604）、`seed-defaults.mjs` 移除各题 `reasonRules` 属性。

### 前端
- 删组件 `MatchExplanation.tsx`。
- `match-client.tsx`：移除 `MatchExplanation` 块（242-256），原位放「对方信息」卡（§5）。
- `MatchHistoryList.tsx`：移除 `MatchExplanation` import 与渲染（9、102-106），改为展示对方信息（§5）+ 反馈入口（§6）。
- `_lib/types.ts`：`DashboardMatch` 删 `reasons/reason/conversationTopics`。
- `_lib/format.ts`：删 reason/topics normalize（先 grep 确认无其它引用）。
- `admin/cycles/page.tsx`：删预览 `pair.reasons` 渲染（939）与 `truncateAdminNarrativePreview`（如存在）。
- admin 问卷编辑器 `admin-questionnaire-client.tsx` + `admin/types.ts`：删除 reasonRules 表单状态、增删改 UI、校验、计数徽标。

### 配置
- 删 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`MATCH_NARRATIVE_GENERATION_ENABLED`：`env.ts`、`.env.example`、`docker-compose.yml`、`test/jest.setup.ts`。

## 5. 设计 B — 展示「对方信息」（match 卡片 + 历史列表）

揭晓后立即展示对方三项：本人性别、性别偏好、本周交友意向。

- **数据来源**：`gender`←对方 answers `hard_gender`；`partnerGenders`←对方 answers `hard_partner_genders`；`weeklyIntent`←对方该 cycle 的 `CycleParticipation.intent`。
- **DTO**：`DashboardMatchParticipantResponseDto` 新增 `gender: string|null`、`partnerGenders: string[]`、`weeklyIntent: 'FRIEND'|'DATE'|'BOTH'|null`。
- **快照（关键修正）**：
  - 三条同步路径的 participation select 均加 `intent`。
  - 构建 `intentByUserId: Map<string, WeeklyIntent|null>`，**覆盖 match 全体参与者**（含 counterpart）；在 `syncUserCycleSnapshotDirect` 中额外按 `match.participants[].userId` 查该 cycle 的 participations 以补 counterpart intent。
  - 经 `buildSnapshotPayload` 透传 `intentByUserId` 进 `buildMatchPayload`。
  - `buildMatchPayload` 解析 answers（复用 `packages/shared` hard-match 常量/解析）并填三字段；`hideSensitiveFields` 时与现状一致（participants 置空）。
- **旧快照兼容**：`readDashboardMatchPayload` 读取时对缺失字段补默认（`gender:null, partnerGenders:[], weeklyIntent:null`），保证响应 shape 稳定；web 类型对应字段标为可选/nullable。
- **前端**：`match-client.tsx` 与 `MatchHistoryList.tsx` 在原 reason/topics 位置渲染「对方信息」卡（揭晓且 VISIBLE）。映射 `FRIEND/DATE/BOTH→交友/约会/都可以`（复用 `lib/weekly-intent`）；`partnerGenders` 以「、」连接；性别值直接显示。

## 6. 设计 C — 反馈评价

反馈**整体选填**：可不评价；一旦提交，则**评分必填、文字选填**。

### 数据模型
```prisma
model MatchFeedback {
  id            String   @id @default(cuid())
  matchId       String
  match         Match    @relation(fields: [matchId], references: [id], onDelete: Cascade)
  authorUserId  String
  author        User     @relation("FeedbackAuthor", fields: [authorUserId], references: [id], onDelete: Cascade)
  subjectUserId String
  subject       User     @relation("FeedbackSubject", fields: [subjectUserId], references: [id], onDelete: Cascade)
  rating        Int
  comment       String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([matchId, authorUserId])
  @@index([subjectUserId])
}
```
`Match` 与 `User`（两条命名关系，风格对齐 `Report` 的 Reporter/ReportedUser）补反向关系。

### API（account 模块，`/me/matches/:matchId/feedback`）
- `PUT /me/matches/:matchId/feedback`（upsert）。
  - **鉴权规则（修正：非"仅最新"，服务端强制）**：当前用户须为该 match 参与者，且 match 已揭晓（`revealedAt != null`），且非 LIMITED（被举报/拉黑则拒绝）。允许对**任意符合条件的历史 match** 评价（契合"每次匹配"）。
  - body：`{ rating: int 1-5（必填）, comment?: string（≤1000，trim 后空串视为 null） }`。
  - `subjectUserId` 由后端取 counterpart，不接受前端传入。
  - 返回 `{ rating, comment, submittedAt }`。
  - **可见性**：评价绝不出现在对方任何响应中。
- **回填**：`getDashboard` 读快照后，对「latestMatch + 历史项」涉及的全部 matchId 做**一次** `matchFeedback.findMany({ where: { matchId in [...], authorUserId: me } })`，将 `currentUserFeedback: { rating, comment, submittedAt }|null` 叠加到 `latestMatch` 与各 `DashboardHistoryItem.match`（**不进冻结快照**）。
- **admin 可见（修正）**：扩展 `getCycleMatches`——match select 增 `feedback`（含 author/subject、rating、comment、时间），normalize 后随每个 match 返回；新增/扩展 admin matches DTO 字段；`admin/cycles/page.tsx` 匹配列表渲染双方反馈（admin-only）。

### 前端
- `_lib/types.ts`：`DashboardMatch` 增 `currentUserFeedback: { rating: number; comment: string|null; submittedAt: string }|null`。
- 新增 `FeedbackForm` 组件（仿 `ReportForm` 内联表单）：评分 1-5（必填）+ 文字（选填）。
- `match-client.tsx`：二级操作区按钮——未评价「填写本次反馈」/已评价「查看·修改评价」→ 打开 FeedbackForm（scoped to latestMatch.id）。
- `MatchHistoryList.tsx`：每条历史项加同样的反馈入口（复用 FeedbackForm + 当前编辑 matchId 状态，仿 ReportForm 用法）。
- `useMatchActions`（或新增 `useMatchFeedback`）承载提交状态与乐观更新（提交后本地写回对应 match 的 `currentUserFeedback`）。
- `apps/web/src/lib/api.ts`：新增 `submitMatchFeedback(matchId, { rating, comment })`。

## 7. 引荐邮件重构（按收件人视角）

- `IntroductionEmailInput`：删顶层 `reason`/`conversationTopics`；在 `requester` 与 `recipient` **各自对象**上新增 `gender: string|null`、`partnerGenders: string[]`、`weeklyIntent: 'FRIEND'|'DATE'|'BOTH'|null`。
- `buildIntroductionEmails`：两封邮件各取 `otherParty` 的三字段；`buildIntroductionEmail` 渲染「对方信息」区块（性别/性别偏好/本周意向），删除 reason/topics 段落（纯文本+HTML 两版）。
- `account.service`（2011-）：从各 participant 的 `questionnaireResponse.answers` 解析 gender/partnerGenders，从该 cycle 的 `CycleParticipation.intent` 取 weeklyIntent，分别填入 requester/recipient。
- 缺失字段做空安全（该条目省略而非显示空值）。中文映射与 §5 一致。

## 8. 数据模型与迁移

单条迁移（保留历史行）：
1. `ALTER TABLE "Match" DROP COLUMN "reason","reasons","conversationTopics","narrativeSource";`
2. `ALTER TABLE "Question" DROP COLUMN "reasonRules";`
3. `DROP TYPE "MatchNarrativeSource";`
4. `CREATE TABLE "MatchFeedback" (...)` + 唯一约束 `(matchId, authorUserId)` + 索引 `(subjectUserId)` + 外键。
- `schema.prisma` 同步删字段/枚举、加 `MatchFeedback` 及反向关系；`prisma generate` 重生成 client。
- **所有现有 Match/MatchParticipant 行保留**；遵守 Prisma 7 driver adapter 约定（schema 不含 `url`）。

## 9. API 契约变更摘要

- `DashboardMatchResponseDto`：删 `reasons/reason/conversationTopics`；加 `currentUserFeedback`。
- `DashboardMatchParticipantResponseDto`：加 `gender/partnerGenders/weeklyIntent`。
- `DashboardHistoryItem.match`：随上同步（含对方信息 + currentUserFeedback）。
- 新增 `PUT /me/matches/:matchId/feedback` 与请求/响应 DTO。
- admin matches：删 narrative 字段，加双方 feedback；问卷 admin DTO 删 `reasonRules`。

## 10. 测试计划

- 删 `match-narrative.service.spec.ts`。
- `cycles.service.spec.ts`：删/改 narrative + reasons + reasonRules 用例；`scorePair` 断言改为仅 score。
- `account.service.spec.ts`：删 narrative/topics + reasonRules fixtures；加引荐邮件含对方信息、`currentUserFeedback` 注入用例。
- `mail.service.spec.ts`：断言对方信息区块、不含 reason/topics、双视角正确。
- `dashboard-snapshot.service.spec.ts`：断言 payload 含 `gender/partnerGenders/weeklyIntent`（含 counterpart intent 在三路径均正确）、不含 narrative 字段。
- `admin.service.spec.ts`：删 reasonRules/narrative；加 matches 含 feedback。
- `questionnaire-config.spec.ts`（33-55）：删 `normalizeQuestionReasonRules` 测试。
- `questionnaire.service.spec.ts`（157-185）：删「问卷含 reasonRules」断言。
- `scripts/review-merge-readiness.test.mjs`（52-60）：删/改 `reason={latestMatch.reason}` 断言（match-client 已不再有该字段）。
- 新增 feedback 端点测试：upsert、鉴权（非参与者/未揭晓/LIMITED 拒绝）、评分校验、对方不可见。
- web：match 页/历史列表对方信息卡与反馈入口渲染；admin 问卷编辑器去 reasonRules。
- 按 AGENTS.md：shared 改动跑 shared build/test；API 改动跑 build + 相关测试；web 改动跑 typecheck/build。

## 11. 风险与回滚

- **迁移不可逆**：删列删枚举为破坏性（仅删已废弃数据）；回滚需反向迁移重建结构（内容不可恢复，产品已确认不再需要）。
- **快照兼容**：旧快照缺新字段——读取时补默认；新揭晓轮次完整。
- **reveal 行为变化**：移除 pending narrative 等待后揭晓更快；确认无其它逻辑依赖该窗口。
- **reasonRules 全删**：触及 admin 问卷编辑器与 Question 迁移；已确认 reasonRules 不影响 score，删除安全。
- **关系命名**：`MatchFeedback` 在 User 上两条命名关系，风格对齐 `Report`。

## 12. 实施顺序

1. Prisma schema + 迁移（删 Match 四列、`Question.reasonRules`、枚举；建 `MatchFeedback`）→ `prisma generate`。
2. `packages/shared`（如需补展示映射/类型）。
3. API：删 narrative + reasonRules 管线（cycles/scorePair）→ 快照三路径补 intent 与对方信息 → 引荐邮件双视角 → feedback 端点 + getDashboard 叠加 → admin matches 加 feedback / 删 reasonRules。
4. web：删 MatchExplanation/类型/格式化 → 对方信息卡（match 页 + 历史）→ 反馈入口/表单/api → admin 页（cycles 预览、问卷编辑器）清理。
5. seed 清理（`prisma/seed.ts`、`seed-history.mjs`、`seed-meetup-demo.mjs`、`seed-defaults.mjs`）。
6. 配置清理（env/.env.example/docker-compose/jest.setup）。
7. 测试更新与全量校验（含 `scripts/review-merge-readiness.test.mjs`；按改动面 build + test）。

## 13. Codex Review 第一轮 — 修正落实

- **[B1] 引荐邮件双视角**：counterpart 字段下放到 `requester`/`recipient` 各自对象，渲染取 `otherParty.*`（§7）。
- **[B2] 反馈作用域**：改为「任意 已揭晓 且 未受限 的本人参与 match」，服务端强制（§6）；UI 覆盖 match 页 + 历史列表。
- **[B3] 快照 counterpart intent**：三条同步路径均补 `intent` 并构建覆盖全体参与者的 `intentByUserId`，修复 `syncUserCycleSnapshotDirect`（§5）。
- **[B4] 历史列表**：`MatchHistoryList.tsx` 同步去 `MatchExplanation`、改对方信息 + 反馈入口（§4/§5/§6）。
- **[B5] seed 脚本**：`seed-history.mjs`、`seed-meetup-demo.mjs` 清理 narrative 字段（§4/§12）。
- **[B6] 匹配理由彻底删除**：含 `cycles.service` 预览 `reasons`、admin 预览 UI、`Question.reasonRules` 全链路（§4），并显式决定**删除** reasonRules。
- **[B7] admin feedback**：扩展 `getCycleMatches` + DTO + web admin UI（§6）。
- **[N8] 旧快照 cast**：读取补默认值 + web 类型可选（§5）。
- **[N9] 函数名修正**：`scorePair`/`buildReasonMessages`/`normalizeStoredReasons`，无 `buildHeuristicReasons`（§3/§4）。

### Codex Review 第二轮 — 补充落实
- 第二轮确认 7 个 BLOCKING 全部解决；验证 `scorePair` 打分独立于 reasonRules（删除安全）、无 N+1/越权泄漏、预览 reasons 移除链路完整。
- 补充遗漏调用点：主 seed `prisma/seed.ts`、问卷模块 `questionnaire-config.ts`（`normalizeQuestionReasonRules`/`QUESTION_REASON_RULE_TYPES`）与 `questionnaire.service.ts`（公共 payload）及其 spec、`scripts/review-merge-readiness.test.mjs` 断言（§4/§10/§12）。
- 裁定：补充后 spec 可进入实施。
