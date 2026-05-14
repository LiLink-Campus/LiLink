# 见面会话合同与设计

本文档定义在匹配引荐完成后安排第一次见面的、可直接落地实现的合同。

## 目标

- 在现有一键引荐流程完成后，允许用户发起见面会话。
- 保持当前 LiLink 克制的 UX：只在用户主动操作成功后显示 toast，不为被动状态变化显示 toast。
- v1 以严格双人协商交付，同时保持表名使用复数，为后续多人版本预留语义空间。
- 保持引荐、见面协商、取消、过期、归档语义互相独立。

## 当前产品决策

- 当 `Match.introducedAt` 不为 null 后，该匹配才具备发起见面的资格。
- 本版本不增加会话前的见面拒绝状态。
- 只有参与者带着第一条提议进入见面流程时，才创建见面会话。
- V1 只支持两个参与者。除非已引荐的匹配正好有两条 `MatchParticipant` 记录，否则 `start` 必须失败。
- 见面会话与引荐/匹配是一对一关系：一个 `Match` 最多只能有一个 `MeetupSession`。
- 已取消、已过期和已归档的会话都是终态历史，会永久阻止同一匹配再次创建见面会话。
- 退出协商统一表示为取消会话，无论会话仍在协商中还是已经锁定。
- 已锁定的会话可以在见面时间前修改。每个参与者每个会话只能修改一次。
- 已锁定会话的修改表示提出新的时间、地点，或两者都提出。
- 已锁定会话的取消也计入该参与者的一次修改记录，以保持审计和规则一致，虽然会话会立即结束。
- 地点选项只能来自服务端 hardcode 的 `locationCandidates` 集合。每个 candidate 包含稳定 `id`、名称、`latitude`、`longitude`；客户端只提交 candidate ID，服务端负责复制名称和经纬度快照。
- 不接入高德 API，不加载高德地图 picker，不接受客户端提交任意经纬度。
- 见面会话过期时长由用户在用户设置中配置，单位为周，最小 1 周，最大 4 周，默认 2 周。
- 单个会话的有效过期时长使用双方用户设置中较短的一方；进入 `LOCKED` 时固化该值，后续用户修改设置不 retroactive 改变该 session。
- 已锁定会话默认在最终确认时间段结束后 1 小时达到归档条件。
- 第一版只有一种 dashboard task 类型：meetup，`priority: 11`。
- 如果用户未触碰引荐，且对方发出见面提议后一天内未采取任何操作，则每个见面会话最多发送一次邮件提醒。

## 术语

- 引荐：现有的匹配联系流程。当前代码中由 `Match.introducedAt` 表示。
- 见面会话：用于安排第一次见面的协商容器。
- 提议：一条消息，提供 2-3 个时间选项、2-3 个地点选项，或其中一个维度。
- 选项：一个被提议的时间或地点。
- 轮次：下一步需要回应的参与者集合。
- 最终确认：由提出当前完整时间 + 地点方案的参与者完成的最后一次确认。
- 最终确认时间段：最终锁定的 `TIME` 选项，即 `confirmedTime.startsAt` 到 `confirmedTime.endsAt`。
- 已锁定：时间和地点都已最终确定。
- 已取消：参与者退出协商，或在实际见面发生前取消已锁定的见面。
- 地点候选：服务端 hardcode 的 `locationCandidates` 条目，包含名称和经纬度。客户端 picker 只能从该集合选择。
- 已过期：active 协商超过本 session 的有效过期时间后进入的终态历史，会永久阻止同一匹配再次创建见面会话。
- 已归档：最终确认的见面时间段结束后进入的后续保留状态；默认在 `confirmedTime.endsAt + 1 hour` 后归档，不允许重新发起见面会话。

## 数据模型

### Prisma 枚举

```prisma
enum MeetupSessionStatus {
  ACTIVE
  LOCKED
  CANCELED
  EXPIRED
  ARCHIVED
}

enum MeetupParticipantTurnState {
  NONE
  REQUIRED
  WAITING
}

enum MeetupMessageType {
  PROPOSE
  ACCEPT
  REJECT
  FINAL_CONFIRM
  REVISE_AFTER_LOCK
  CANCEL
}

enum MeetupCancelReason {
  USER_CANCELED
  MATCH_REPORTED
  MATCH_BLOCKED
  MATCH_LIMITED
}

enum MeetupProposalScope {
  BOTH
  TIME_ONLY
  LOCATION_ONLY
}

enum MeetupProposalStatus {
  PENDING
  PARTIALLY_ACCEPTED
  CONFIRMED
  REJECTED
  SUPERSEDED
}

enum MeetupOptionKind {
  TIME
  LOCATION
}

enum MeetupOptionStatus {
  PENDING
  CONFIRMED
  REJECTED
  DISABLED
}
```

### Prisma 模型

```prisma
model MeetupSession {
  id                            String                @id @default(cuid())
  matchId                       String                @unique
  match                         Match                 @relation(fields: [matchId], references: [id], onDelete: Cascade)
  status                        MeetupSessionStatus   @default(ACTIVE)

  currentProposalId             String?               @unique
  currentProposal               MeetupProposal?       @relation("MeetupSessionCurrentProposal", fields: [currentProposalId], references: [id], onDelete: SetNull)
  confirmedTimeOptionId         String?               @unique
  confirmedTimeOption           MeetupOption?         @relation("MeetupSessionConfirmedTime", fields: [confirmedTimeOptionId], references: [id], onDelete: SetNull)
  confirmedLocationOptionId     String?               @unique
  confirmedLocationOption       MeetupOption?         @relation("MeetupSessionConfirmedLocation", fields: [confirmedLocationOptionId], references: [id], onDelete: SetNull)
  finalConfirmRequiredByUserId  String?
  finalConfirmRequiredByUser    User?                 @relation("MeetupSessionFinalConfirmUser", fields: [finalConfirmRequiredByUserId], references: [id], onDelete: SetNull)

  startedByUserId               String
  startedByUser                 User                  @relation("MeetupSessionStartedBy", fields: [startedByUserId], references: [id], onDelete: Cascade)
  canceledByUserId              String?
  canceledByUser                User?                 @relation("MeetupSessionCanceledBy", fields: [canceledByUserId], references: [id], onDelete: SetNull)
  cancelReason                  MeetupCancelReason?
  cancelNote                    String?

  // Set when a locked meetup is reopened for revision. While set, mutations remain guarded by the previous locked start time.
  reopenedFromLockedAt          DateTime?
  reopenedFromLockedStartsAt    DateTime?
  lockVersion                   Int                   @default(0)

  lastActiveAt                  DateTime              @default(now())
  effectiveExpirationWeeks      Int?
  expiresAt                     DateTime?
  archiveEligibleAt             DateTime?
  lockedAt                      DateTime?
  canceledAt                    DateTime?
  expiredAt                     DateTime?
  archivedAt                    DateTime?
  createdAt                     DateTime              @default(now())
  updatedAt                     DateTime              @updatedAt
  participants                  MeetupParticipant[]
  messages                      MeetupMessage[]
  proposals                     MeetupProposal[]      @relation("MeetupSessionProposals")
  options                       MeetupOption[]        @relation("MeetupSessionOptions")

  @@index([status, lastActiveAt])
  @@index([status, expiresAt])
  @@index([status, archiveEligibleAt])
  @@index([startedByUserId, createdAt])
  @@index([finalConfirmRequiredByUserId])
}

model MeetupParticipant {
  id                 String                     @id @default(cuid())
  sessionId          String
  session            MeetupSession              @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  userId             String
  user               User                       @relation("MeetupParticipantUser", fields: [userId], references: [id], onDelete: Cascade)
  matchParticipantId String
  matchParticipant   MatchParticipant           @relation(fields: [matchParticipantId], references: [id], onDelete: Cascade)
  turnState          MeetupParticipantTurnState @default(NONE)
  responseRequiredAt DateTime?
  responseRequiredMessageId String?
  responseRequiredMessage   MeetupMessage?       @relation("MeetupParticipantResponseRequired", fields: [responseRequiredMessageId], references: [id], onDelete: SetNull)
  revisionUsedAt     DateTime?
  lastSeenAt         DateTime?
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt

  @@unique([sessionId, userId])
  @@unique([sessionId, matchParticipantId])
  @@index([userId, turnState])
  @@index([responseRequiredAt])
  @@index([responseRequiredMessageId])
}

model MeetupMessage {
  id            String             @id @default(cuid())
  sessionId     String
  session       MeetupSession      @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  actorUserId   String
  actor         User               @relation("MeetupMessageActor", fields: [actorUserId], references: [id], onDelete: Cascade)
  type          MeetupMessageType
  notePreset    String?
  noteText      String?
  createdAt     DateTime           @default(now())
  proposal      MeetupProposal?
  responseRequiredParticipants MeetupParticipant[] @relation("MeetupParticipantResponseRequired")

  @@index([sessionId, createdAt])
  @@index([actorUserId, createdAt])
}

model MeetupProposal {
  id                 String                @id @default(cuid())
  sessionId          String
  session            MeetupSession         @relation("MeetupSessionProposals", fields: [sessionId], references: [id], onDelete: Cascade)
  messageId          String                @unique
  message            MeetupMessage         @relation(fields: [messageId], references: [id], onDelete: Cascade)
  actorUserId        String
  actorUser          User                  @relation("MeetupProposalActor", fields: [actorUserId], references: [id], onDelete: Cascade)
  scope              MeetupProposalScope
  status             MeetupProposalStatus  @default(PENDING)
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt
  options            MeetupOption[]
  currentForSession  MeetupSession?        @relation("MeetupSessionCurrentProposal")

  @@index([sessionId, status, createdAt])
  @@index([sessionId, actorUserId])
}

model MeetupOption {
  id               String              @id @default(cuid())
  proposalId       String
  proposal         MeetupProposal       @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  sessionId        String
  session          MeetupSession        @relation("MeetupSessionOptions", fields: [sessionId], references: [id], onDelete: Cascade)
  kind             MeetupOptionKind
  status           MeetupOptionStatus   @default(PENDING)

  // TIME fields
  startsAt         DateTime?
  endsAt           DateTime?
  toleranceMinutes Int                 @default(10)

  // LOCATION fields. Values are copied from server-side locationCandidates.
  locationCandidateId String?
  placeName        String?
  latitude         Float?
  longitude        Float?

  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt
  confirmedTimeForSession      MeetupSession? @relation("MeetupSessionConfirmedTime")
  confirmedLocationForSession  MeetupSession? @relation("MeetupSessionConfirmedLocation")

  @@index([sessionId, kind, status])
  @@index([proposalId, kind])
}
```

说明：

- 给 `Match` 增加 `meetupSession MeetupSession?`。
- 给 `User` 增加具名关系反向字段，覆盖发起人、取消人、最终确认人、提议发起人、见面参与者、见面消息。
- 给 `User` 或用户设置表增加 `meetupExpirationWeeks Int @default(2)`，服务层校验取值只能为 `1..4`。
- 给 `MatchParticipant` 增加 `meetupParticipants MeetupParticipant[]`。
- 即使关系名使用复数，V1 服务逻辑也必须强制正好两个参与者。
- `MeetupSession.matchId @unique` 是有意设计：已取消、已过期、已归档的会话会永久阻止同一匹配再次创建见面会话。
- `locationCandidates` 由 API 服务端 hardcode，是地点 picker 的唯一数据源。每个 candidate 必须包含稳定 `id`、名称、有限数值型 `latitude`、有限数值型 `longitude`。
- 创建 `LOCATION` 选项时，请求只携带 `locationCandidateId`；服务端从 `locationCandidates` 复制 `placeName`、`latitude`、`longitude` 到 `MeetupOption`，作为当时选择的审计快照。
- 对 `LOCATION` 选项，`locationCandidateId`、`placeName`、`latitude`、`longitude` 由服务校验强制必填；Prisma 字段保持可空只是为了与 `TIME` 选项共用同一张表。
- `effectiveExpirationWeeks` 是本 session 实际使用的过期时长快照，值必须在 `1..4`。会话进入 `LOCKED` 时必须固化为双方当前设置中的较短值。
- `expiresAt` 是 active 协商过期时间；`archiveEligibleAt` 是 locked 会话可归档时间，默认等于最终确认的 `confirmedTime.endsAt + 1 hour`。
- 时间值以 ISO datetime 存入数据库。产品展示可默认使用学校地区时区，当前为 `Asia/Shanghai`。
- `toleranceMinutes` 默认值为 `10`；只有未来 UI 暴露该控件时才允许编辑。
- 增加原始 SQL 迁移保护，因为 Prisma 无法表达部分索引：

  ```sql
  CREATE UNIQUE INDEX meetup_proposal_one_pending_per_session
    ON "MeetupProposal" ("sessionId")
    WHERE "status" = 'PENDING';
  ```

- 服务事务也必须把 `MeetupSession.currentProposalId` 当作当前待处理提议的事实来源。

服务必须强制的数据不变量：

- V1 中一个会话正好有两条 `MeetupParticipant` 记录。
- 每个 `MeetupParticipant.userId` 必须等于其 `MatchParticipant.userId`，并且两条 `MatchParticipant` 记录都必须属于 `MeetupSession.matchId`。
- `currentProposalId` 非 null 时，必须指向同会话且 `status = PENDING` 的提议。
- 当会话为 `LOCKED`、终态，或正在等待 `finalConfirmRequiredByUserId` 时，`currentProposalId` 必须为 null。
- `confirmedTimeOptionId` 非 null 时，必须指向同会话的 `TIME` 选项。
- `confirmedLocationOptionId` 非 null 时，必须指向同会话的 `LOCATION` 选项。
- `LOCATION` 选项必须有 `locationCandidateId`，且该 ID 必须能在服务端 `locationCandidates` 中找到；落库的名称和经纬度必须来自服务端候选快照。
- `status = ACTIVE` 时 `expiresAt` 必须为非 null；`status = LOCKED` 时 `archiveEligibleAt` 必须为非 null。
- `effectiveExpirationWeeks` 如果非 null，必须在 `1..4`。
- `finalConfirmRequiredByUserId` 非 null 时，必须是两个会话参与者之一。
- `MeetupOption.sessionId` 必须始终与 `MeetupProposal.sessionId` 一致；这个冗余字段只是为了查询和索引便利，不是独立事实来源。

## 共享类型常量

新增 `packages/shared/src/meetup.ts`，用于 web 和 API 共享稳定枚举常量与纯 helper。

```ts
export const MEETUP_USER_TURN_STATUSES = [
  "NOT_STARTED",
  "WAITING_FOR_COUNTERPART",
  "NEEDS_YOUR_RESPONSE",
  "NONE",
] as const;

export type MeetupUserTurnStatus =
  (typeof MEETUP_USER_TURN_STATUSES)[number];

export const MEETUP_PROGRESS_STATUSES = [
  "NOT_STARTED",
  "NEGOTIATING",
  "LOCATION_CONFIRMED_TIME_PENDING",
  "TIME_CONFIRMED_LOCATION_PENDING",
  "AWAITING_FINAL_CONFIRMATION",
  "LOCKED",
  "CANCELED",
  "EXPIRED",
  "ARCHIVED",
] as const;

export type MeetupProgressStatus = (typeof MEETUP_PROGRESS_STATUSES)[number];

export const MEETUP_PROPOSAL_SCOPES = [
  "BOTH",
  "TIME_ONLY",
  "LOCATION_ONLY",
] as const;

export type MeetupProposalScope = (typeof MEETUP_PROPOSAL_SCOPES)[number];

export type MeetupLocationCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

export const DEFAULT_MEETUP_TOLERANCE_MINUTES = 10;
export const MIN_MEETUP_PROPOSAL_LEAD_MINUTES = 30;
export const MIN_MEETUP_EXPIRATION_WEEKS = 1;
export const MAX_MEETUP_EXPIRATION_WEEKS = 4;
export const DEFAULT_MEETUP_EXPIRATION_WEEKS = 2;
export const MEETUP_ARCHIVE_AFTER_FINAL_DECISION_MINUTES = 60;
export const MEETUP_TODO_PRIORITY = 11;
```

## API 模块

创建 `apps/api/src/modules/meetup`。

### 路由

所有路由都要求 `JwtAuthGuard`。用户只能访问自己是参与者且底层匹配对自己仍可见的会话。

```txt
GET  /me/meetup-location-candidates
GET  /me/meetup-sessions/:sessionId
POST /me/matches/:matchId/meetup/start
POST /me/meetup-sessions/:sessionId/proposals
POST /me/meetup-sessions/:sessionId/options/accept
POST /me/meetup-sessions/:sessionId/proposals/:proposalId/reject
POST /me/meetup-sessions/:sessionId/final-confirm
POST /me/meetup-sessions/:sessionId/revise
POST /me/meetup-sessions/:sessionId/cancel
POST /me/meetup-sessions/:sessionId/seen
```

`GET /me/meetup-location-candidates` 返回服务端 hardcode 的 `locationCandidates`，用于 web 自研 picker。该端点不代理任何第三方地图 API。

用户设置接口需要暴露 `meetupExpirationWeeks`，取值只能为 `1 | 2 | 3 | 4`，默认值为 `2`。具体路由沿用仓库现有用户设置模块；meetup 模块只消费该设置。

### 请求 DTO

仓库全局 `ValidationPipe` 使用 whitelist/forbid 行为，所以所有被接受的请求字段都必须有 `class-validator` 装饰器。以下是合同级 DTO 草图；实现时应从 `@lilink/shared` 导入共享常量。

```ts
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class StartMeetupSessionDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMeetupProposalDto)
  proposal!: CreateMeetupProposalDto;
}

export class CreateMeetupProposalDto {
  @IsIn(["BOTH", "TIME_ONLY", "LOCATION_ONLY"])
  scope!: "BOTH" | "TIME_ONLY" | "LOCATION_ONLY";

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => MeetupTimeOptionInputDto)
  timeOptions?: MeetupTimeOptionInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => MeetupLocationOptionInputDto)
  locationOptions?: MeetupLocationOptionInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class MeetupTimeOptionInputDto {
  @IsISO8601()
  startsAt!: string; // ISO datetime

  @IsISO8601()
  endsAt!: string;   // ISO datetime, must be after startsAt

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(60)
  toleranceMinutes?: number; // default 10, min 0, max 60
}

export class MeetupLocationOptionInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  locationCandidateId!: string;
}

export class UpdateMeetupSettingsDto {
  @IsIn([1, 2, 3, 4])
  meetupExpirationWeeks!: 1 | 2 | 3 | 4;
}

export class AcceptMeetupOptionsDto {
  @IsOptional()
  @IsString()
  timeOptionId?: string;

  @IsOptional()
  @IsString()
  locationOptionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class RejectMeetupProposalDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  notePreset?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  noteText?: string;
}

export class ReviseMeetupSessionDto {
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateMeetupProposalDto)
  proposal!: CreateMeetupProposalDto;
}

export class CancelMeetupSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

校验：

- `start` 要求 `Match.introducedAt != null`。
- 除非匹配正好有两个 `MatchParticipant`，否则 `start` 失败。
- 如果匹配已经存在任何见面会话，包括 `CANCELED`、`EXPIRED` 或 `ARCHIVED`，`start` 必须失败。
- 如果任一参与者拉黑/举报了对方，或该匹配按 dashboard snapshot 规则会以受限可见性返回，则 `start`、`GET session`、所有 mutation、任务生成、提醒入队必须失败或 no-op。
- `start` 和 `revise` 要求请求体中存在对象类型的 `proposal`。
- `scope = BOTH` 要求 2-3 个时间选项和 2-3 个地点选项。
- `scope = TIME_ONLY` 要求 2-3 个时间选项且不能有地点选项。
- `scope = LOCATION_ONLY` 要求 2-3 个地点选项且不能有时间选项。
- `startsAt` 必须早于 `endsAt`。
- 创建提议时，每个 `startsAt` 必须至少晚于服务端事务时间 `MIN_MEETUP_PROPOSAL_LEAD_MINUTES`。V1 使用 `30` 分钟。
- 接受时间选项时，或接受另一个维度会让已有确认时间组成完整方案时，最终确认出来的 `startsAt` 必须仍晚于服务端事务时间。
- `final-confirm` 必须在同一事务中重新读取已确认时间选项，并在 `now >= confirmedTime.startsAt` 时失败。
- 地点选项必须提交存在于服务端 `locationCandidates` 集合中的 `locationCandidateId`。请求体不得包含 `placeName`、`latitude`、`longitude` 等可覆盖服务端候选数据的字段。
- 服务端创建地点选项时从 candidate 复制名称和经纬度；如果 candidate 不存在，返回稳定校验错误。
- 同一个提议内的 `locationCandidateId` 不允许重复。
- `meetupExpirationWeeks` 设置只能为 `1..4` 周；缺失时按默认 `2` 周处理。
- `accept` 必须选择来自 `MeetupSession.currentProposalId` 的选项 ID。
- 提议发起人不能 `accept` 自己的提议。
- `accept` 可以选择一个维度或两个维度，但至少必须选择一个选项。
- `final-confirm` 只允许 `finalConfirmRequiredByUserId` 执行。
- `POST /proposals` 允许当前 `turnState = REQUIRED` 的参与者执行；当当前用户是 `finalConfirmRequiredByUserId` 时，也允许作为明确的“继续协商”路径。
- 所有 active mutation 在执行业务动作前都必须检查 `expiresAt`。如果 `expiresAt <= now`，先把会话收敛为 `EXPIRED`，再返回不可操作错误。
- `revise` 只允许在 `status = LOCKED`、`now < confirmedTime.startsAt`、且当前参与者没有 `revisionUsedAt` 时执行。
- `cancel` 允许在 `status = ACTIVE` 或 `status = LOCKED` 时执行。如果 `status = LOCKED` 或设置了 `reopenedFromLockedStartsAt`，`now` 必须早于对应的保护开始时间。
- 所有 mutating routes 都在一个事务中执行，并对 `session.status`、`session.currentProposalId`、参与者 `turnState`、`finalConfirmRequiredByUserId` 使用 compare-and-set 条件。如果条件更新影响 0 行，返回 stale-state conflict。
- `POST /seen` 没有请求体。它幂等更新当前参与者的 `lastSeenAt = now`，不更新 `lastActiveAt`，不创建消息，返回 `204`，并且绝不显示 toast。

### 响应 DTO

```ts
export type MeetupUserTurnStatus =
  | "NOT_STARTED"
  | "WAITING_FOR_COUNTERPART"
  | "NEEDS_YOUR_RESPONSE"
  | "NONE";

export type MeetupProgressStatus =
  | "NOT_STARTED"
  | "NEGOTIATING"
  | "LOCATION_CONFIRMED_TIME_PENDING"
  | "TIME_CONFIRMED_LOCATION_PENDING"
  | "AWAITING_FINAL_CONFIRMATION"
  | "LOCKED"
  | "CANCELED"
  | "EXPIRED"
  | "ARCHIVED";

export class MeetupSessionResponseDto {
  id!: string;
  matchId!: string;
  status!: "ACTIVE" | "LOCKED" | "CANCELED" | "EXPIRED" | "ARCHIVED";
  userTurnStatus!: MeetupUserTurnStatus;
  progressStatus!: MeetupProgressStatus;
  startedByUserId!: string;
  counterpartUserId!: string;
  counterpartDisplayName!: string | null;
  currentProposalId!: string | null;
  confirmedTimeOptionId!: string | null;
  confirmedLocationOptionId!: string | null;
  finalConfirmRequiredByUserId!: string | null;
  lockedAt!: string | null;
  canceledAt!: string | null;
  canceledByUserId!: string | null;
  effectiveExpirationWeeks!: number | null;
  expiresAt!: string | null;
  archiveEligibleAt!: string | null;
  lastActiveAt!: string;
  currentPlan!: MeetupCurrentPlanResponseDto;
  currentPendingProposal!: MeetupProposalResponseDto | null;
  participants!: MeetupParticipantResponseDto[];
  messages!: MeetupMessageResponseDto[];
  availableActions!: MeetupAvailableActionsResponseDto;
}

export class MeetupCurrentPlanResponseDto {
  timeOption!: MeetupOptionResponseDto | null;
  locationOption!: MeetupOptionResponseDto | null;
  startsAt!: string | null;
  endsAt!: string | null;
  toleranceMinutes!: number | null;
  locationCandidateId!: string | null;
  placeName!: string | null;
  latitude!: number | null;
  longitude!: number | null;
}

export class MeetupParticipantResponseDto {
  userId!: string;
  displayName!: string | null;
  turnState!: "NONE" | "REQUIRED" | "WAITING";
  revisionUsedAt!: string | null;
  lastSeenAt!: string | null;
}

export class MeetupMessageResponseDto {
  id!: string;
  actorUserId!: string;
  type!: "PROPOSE" | "ACCEPT" | "REJECT" | "FINAL_CONFIRM" | "REVISE_AFTER_LOCK" | "CANCEL";
  notePreset!: string | null;
  noteText!: string | null;
  createdAt!: string;
  proposal!: MeetupProposalResponseDto | null;
}

export class MeetupProposalResponseDto {
  id!: string;
  actorUserId!: string;
  scope!: "BOTH" | "TIME_ONLY" | "LOCATION_ONLY";
  status!: "PENDING" | "PARTIALLY_ACCEPTED" | "CONFIRMED" | "REJECTED" | "SUPERSEDED";
  options!: MeetupOptionResponseDto[];
}

export class MeetupOptionResponseDto {
  id!: string;
  kind!: "TIME" | "LOCATION";
  status!: "PENDING" | "CONFIRMED" | "REJECTED" | "DISABLED";
  startsAt!: string | null;
  endsAt!: string | null;
  toleranceMinutes!: number | null;
  locationCandidateId!: string | null;
  placeName!: string | null;
  latitude!: number | null;
  longitude!: number | null;
}

export class MeetupLocationCandidateResponseDto {
  id!: string;
  name!: string;
  latitude!: number;
  longitude!: number;
}

export class MeetupAvailableActionsResponseDto {
  propose!: MeetupActionAvailabilityDto;
  accept!: MeetupActionAvailabilityDto & {
    requiredOptionKinds: Array<"TIME" | "LOCATION">;
  };
  reject!: MeetupActionAvailabilityDto;
  finalConfirm!: MeetupActionAvailabilityDto;
  reviseAfterLock!: MeetupActionAvailabilityDto;
  cancel!: MeetupActionAvailabilityDto;
}

export class MeetupActionAvailabilityDto {
  enabled!: boolean;
  reason!: string | null;
}
```

响应规则：

- `currentPlan` 是权威来源。UI 不得只通过历史选项状态推断当前方案。
- `currentPendingProposal` 镜像 `MeetupSession.currentProposalId`；在最终确认、已锁定、终态状态下为 `null`。
- `GET /me/meetup-location-candidates` 返回 `MeetupLocationCandidateResponseDto[]`。前端 picker 必须以该响应为准，不在客户端 hardcode 地点列表。
- `availableActions.*.reason` 是稳定的、面向开发者的禁用原因文本。UI 可以映射为克制的中文文案。

## Dashboard 合同

扩展 `DashboardResponseDto`：

```ts
export class DashboardTaskResponseDto {
  id!: string;
  type!: "MEETUP";
  priority!: number; // 11
  title!: string;    // "安排第一次见面" by default
  text!: string;     // flexible display text, e.g. "需要你回应"
  href!: string;     // "/dashboard/meetup/:sessionId" or "/dashboard/meetup/start?matchId=:matchId"
  userTurnStatus!: MeetupUserTurnStatus;
  progressStatus!: MeetupProgressStatus;
  matchId!: string;
  sessionId!: string | null;
  updatedAt!: string;
}

export class DashboardMeetupSummaryResponseDto {
  sessionId!: string;
  matchId!: string;
  status!: "ACTIVE" | "LOCKED" | "CANCELED" | "EXPIRED" | "ARCHIVED";
  progressStatus!: MeetupProgressStatus;
  href!: string;
  confirmedStartsAt!: string | null;
  confirmedEndsAt!: string | null;
  confirmedPlaceName!: string | null;
  canReviseAfterLock!: boolean;
  canCancel!: boolean;
  terminalText!: string | null;
}

export class DashboardResponseDto {
  // existing fields...
  tasks!: DashboardTaskResponseDto[];
  meetupSummary!: DashboardMeetupSummaryResponseDto | null;
}
```

任务规则：

- 如果最新可见且已引荐的匹配没有见面会话，则展示一个见面任务：
  - `title = "安排第一次见面"`
  - `text = "可以开始安排第一次见面"`
  - `href = "/dashboard/meetup/start?matchId=:matchId"`
  - `userTurnStatus = "NOT_STARTED"`
  - `progressStatus = "NOT_STARTED"`
- 如果存在正在协商的 active 会话，展示见面任务。
- 如果当前用户 `turnState = REQUIRED`，`text = "需要你回应"`。
- 如果当前用户正在等待，`text = "等待对方回应"`。
- `TIME_CONFIRMED_LOCATION_PENDING` 等进度标签可以作为次级文本显示，但不应替代主要轮次文本。
- 如果 `status = LOCKED`，从首页紧急 `tasks` 中隐藏，但返回 `meetupSummary`，以便 `/dashboard/match` 显示 `查看见面安排`。
- 不在 tasks 中展示 `CANCELED`、`EXPIRED` 或 `ARCHIVED` 会话。
- 对终态会话，`meetupSummary.terminalText = "本次见面安排已结束，当前版本暂不支持重新发起。"`，且不显示重新发起 CTA。
- `meetupSummary` 是实时权威 API 数据，不是 dashboard snapshot 字段。它必须使用与见面会话读取相同的举报/拉黑/受限可见性 gate。

## 轮次状态机

V1 严格双人。一个见面会话有发起者 `A` 和对方 `B`；每个 active 轮次中正好一个参与者为 `REQUIRED`，另一个为 `WAITING`。`LOCKED`、`CANCELED`、`EXPIRED`、`ARCHIVED` 将两个参与者都设为 `NONE`。

数据库生命周期状态保持粗粒度：

```txt
ACTIVE -> LOCKED
ACTIVE -> CANCELED
ACTIVE -> EXPIRED
LOCKED -> ACTIVE   // revise after lock
LOCKED -> CANCELED
LOCKED -> ARCHIVED // after confirmed time range + 1 hour by default
EXPIRED -> ARCHIVED // later
CANCELED -> ARCHIVED // later
```

`CANCELED`、`EXPIRED` 和 `ARCHIVED` 对用户端点来说都是终态。任何用户 mutation 都不能把终态会话移回 `ACTIVE` 或 `LOCKED`；只要该匹配存在任意状态的会话，`POST /me/matches/:matchId/meetup/start` 就必须以 `MEETUP_SESSION_ALREADY_EXISTS` 失败。

### 轮次 Helper

每个状态迁移都使用以下 helper 语义：

```txt
setRequired(requiredUserId, messageId):
  required participant turnState = REQUIRED
  required participant responseRequiredAt = now
  required participant responseRequiredMessageId = messageId
  counterpart turnState = WAITING
  counterpart responseRequiredAt = null
  counterpart responseRequiredMessageId = null

clearTurns():
  both participants turnState = NONE
  both participants responseRequiredAt = null
  both participants responseRequiredMessageId = null

refreshActiveExpiry():
  effectiveExpirationWeeks = min(participant A meetupExpirationWeeks, participant B meetupExpirationWeeks)
  expiresAt = now + effectiveExpirationWeeks weeks
```

`responseRequiredAt` 只用于提醒。当某个迁移让用户变为 `REQUIRED` 时，它必须由服务端时间设置；当该用户回应后必须清空。

`refreshActiveExpiry()` 只用于 `ACTIVE` 协商。它读取双方当前用户设置，缺失设置按默认 `2` 周处理，并使用较短的一方作为本 session 的有效过期时长。任何保持或进入 `ACTIVE` 的状态变更都必须刷新 `expiresAt`。

协商进度由以下字段派生：

- 参与者 `turnState`
- `confirmedTimeOptionId`
- `confirmedLocationOptionId`
- `finalConfirmRequiredByUserId`

### 派生轮次和进度状态

伪代码：

```ts
function deriveMeetupUserTurnStatus(
  session,
  currentUserId,
): MeetupUserTurnStatus {
  if (!session) return "NOT_STARTED";
  if (session.status !== "ACTIVE") return "NONE";

  if (session.finalConfirmRequiredByUserId === currentUserId) {
    return "NEEDS_YOUR_RESPONSE";
  }
  if (session.finalConfirmRequiredByUserId) {
    return "WAITING_FOR_COUNTERPART";
  }

  const currentParticipant = session.participants.find(
    (participant) => participant.userId === currentUserId,
  );

  if (currentParticipant?.turnState === "REQUIRED") {
    return "NEEDS_YOUR_RESPONSE";
  }

  if (currentParticipant?.turnState === "WAITING") {
    return "WAITING_FOR_COUNTERPART";
  }

  return "NONE";
}

function deriveMeetupProgressStatus(session): MeetupProgressStatus {
  if (!session) return "NOT_STARTED";
  if (session.status === "CANCELED") return "CANCELED";
  if (session.status === "EXPIRED") return "EXPIRED";
  if (session.status === "ARCHIVED") return "ARCHIVED";
  if (session.status === "LOCKED") return "LOCKED";

  if (session.finalConfirmRequiredByUserId) {
    return "AWAITING_FINAL_CONFIRMATION";
  }

  if (session.confirmedLocationOptionId && !session.confirmedTimeOptionId) {
    return "LOCATION_CONFIRMED_TIME_PENDING";
  }

  if (session.confirmedTimeOptionId && !session.confirmedLocationOptionId) {
    return "TIME_CONFIRMED_LOCATION_PENDING";
  }

  return "NEGOTIATING";
}
```

### 带提议发起会话

```txt
A starts with proposal
Precondition:
  Match.introducedAt != null
  no existing session for this match in any status
  match has exactly two MatchParticipant rows
  match visibility is VISIBLE for both users
  all submitted time options pass the minimum lead-time gate
  all submitted locationCandidateIds exist in server-side locationCandidates

Create session ACTIVE
Create exactly two participants from match participants
Create PROPOSE message and proposal
Set currentProposalId = proposal.id
Set proposal status = PENDING
setRequired(counterpart user id, PROPOSE message id)
Set lastActiveAt = now
refreshActiveExpiry()
```

初始用户可见状态：

```txt
A: WAITING_FOR_COUNTERPART
B: NEEDS_YOUR_RESPONSE
```

### 接受选项

`REQUIRED` 参与者可以从 `MeetupSession.currentProposalId` 接受一个或两个维度。

```txt
Precondition:
  status = ACTIVE
  finalConfirmRequiredByUserId is null
  currentProposalId points to a same-session PENDING proposal
  current user turnState = REQUIRED
  current user != proposal.actorUserId
  selected option IDs belong to current proposal
  selected dimensions are present in proposal.scope
  at least one option is selected
  any selected TIME option startsAt is after now
  if this accept would complete the plan, the resulting confirmed time startsAt is after now

Action:
  create ACCEPT message
  for each selected dimension:
    selected option -> CONFIRMED
    sibling options of same kind in the same proposal -> DISABLED
    session.confirmed{Dimension}OptionId = selected option id
  for each unselected dimension present in this proposal:
    options of that kind -> DISABLED
  currentProposalId = null
  if both confirmedTimeOptionId and confirmedLocationOptionId are non-null:
    proposal -> CONFIRMED
    finalConfirmRequiredByUserId = proposal.actorUserId
    setRequired(proposal.actorUserId, ACCEPT message id)
  else:
    proposal -> PARTIALLY_ACCEPTED
    finalConfirmRequiredByUserId = null
    setRequired(proposal.actorUserId, ACCEPT message id)
  lastActiveAt = now
  refreshActiveExpiry()
```

部分接受后不要让提议继续保持 `PENDING`。缺失的维度必须由现在变为 `REQUIRED` 的参与者通过新提议补充。

理由：接收方已经从提议者的选项中接受了可用维度或组合。如果方案已经完整，提议者获得一次最终确认机会，然后才能锁定。

### 拒绝提议

```txt
Precondition:
  status = ACTIVE
  finalConfirmRequiredByUserId is null
  currentProposalId points to a same-session PENDING proposal
  current user turnState = REQUIRED
  current user != proposal.actorUserId

Action:
  create REJECT message
  current proposal -> REJECTED
  all options in proposal -> REJECTED or DISABLED
  currentProposalId = null
  setRequired(proposal.actorUserId, REJECT message id)
  lastActiveAt = now
  refreshActiveExpiry()
```

### 提议范围重置

`POST /proposals` 和 `POST /revise` 创建新提议前必须应用同一套 scope reset：

```txt
if scope = TIME_ONLY:
  clear confirmedTimeOptionId
  keep confirmedLocationOptionId
if scope = LOCATION_ONLY:
  clear confirmedLocationOptionId
  keep confirmedTimeOptionId
if scope = BOTH:
  clear confirmedTimeOptionId
  clear confirmedLocationOptionId

finalConfirmRequiredByUserId = null
```

历史选项可以为审计/展示保留 `CONFIRMED` 状态，但除非它们的 ID 等于 `session.confirmedTimeOptionId` 或 `session.confirmedLocationOptionId`，否则它们不是当前方案的一部分。UI 当前方案渲染必须使用 session 上的 confirmed IDs，而不是只看 option status。

### 反提议

当当前用户 `turnState = REQUIRED` 时，`POST /proposals` 实现反提议。当当前用户是 `finalConfirmRequiredByUserId` 时，它也是明确的“继续协商”路径。

```txt
Precondition:
  status = ACTIVE
  current user has turnState = REQUIRED
  OR finalConfirmRequiredByUserId = currentUserId
  all submitted time options pass the minimum lead-time gate
  all submitted locationCandidateIds exist in server-side locationCandidates

Action:
  if currentProposalId is non-null:
    current proposal -> SUPERSEDED
    old pending options -> DISABLED
    currentProposalId = null
  apply proposal scope reset
  create PROPOSE message
  create proposal PENDING
  currentProposalId = new proposal id
  setRequired(counterpart user id, PROPOSE message id)
  lastActiveAt = now
  refreshActiveExpiry()
```

当从 `AWAITING_FINAL_CONFIRMATION` 发起反提议时，此前已接受的完整方案变为历史。新提议的 scope 决定清空哪些已确认维度。

### 最终确认

在 `AWAITING_FINAL_CONFIRMATION` 中，`finalConfirmRequiredByUserId` 只能选择以下一种：

1. `POST /final-confirm` -> `LOCKED`。
2. `POST /proposals` -> 通过反提议继续协商。
3. `POST /cancel` -> `CANCELED`。

不要用单纯 reject 表示拒绝最终确认。最终确认的拒绝必须要么创建反提议，要么取消会话。

```txt
Precondition:
  status = ACTIVE
  confirmedTimeOptionId != null
  confirmedLocationOptionId != null
  finalConfirmRequiredByUserId = currentUserId
  confirmedTime.startsAt is after now

Action:
  create FINAL_CONFIRM message
  status = LOCKED
  lockedAt = now
  lockVersion = lockVersion + 1
  effectiveExpirationWeeks = min(participant A meetupExpirationWeeks, participant B meetupExpirationWeeks)
  expiresAt = null
  archiveEligibleAt = confirmedTime.endsAt + 1 hour
  currentProposalId = null
  finalConfirmRequiredByUserId = null
  reopenedFromLockedAt = null
  reopenedFromLockedStartsAt = null
  clearTurns()
  lastActiveAt = now
```

### 锁定后修改

修改按会话和用户限制，每人一次。`revisionUsedAt` 永不清空，包括重新锁定之后。

```txt
Precondition:
  status = LOCKED
  confirmedTimeOptionId points to a valid same-session TIME option
  now < confirmedTime.startsAt
  current participant revisionUsedAt is null
  all submitted locationCandidateIds exist in server-side locationCandidates

Action:
  participant.revisionUsedAt = now
  status = ACTIVE
  lockedAt = null
  archiveEligibleAt = null
  reopenedFromLockedAt = now
  reopenedFromLockedStartsAt = previous confirmedTime.startsAt
  finalConfirmRequiredByUserId = null
  apply proposal scope reset
  create REVISE_AFTER_LOCK message with proposal
  proposal status = PENDING
  currentProposalId = proposal.id
  setRequired(counterpart user id, REVISE_AFTER_LOCK message id)
  lastActiveAt = now
  refreshActiveExpiry()
```

当 `reopenedFromLockedStartsAt` 已设置时，active 会话中的 `cancel`、`accept`、`reject`、`propose`、`final-confirm` mutation 仍必须在该受保护开始时间之后失败。这样可以防止只修改地点时绕过原始见面开始时间保护，而原始时间仍是当前方案的一部分。

### 取消

```txt
Precondition:
  status in ACTIVE, LOCKED
  if status = LOCKED, now < confirmedTime.startsAt
  if reopenedFromLockedStartsAt is set, now < reopenedFromLockedStartsAt

Action:
  create CANCEL message
  if (status = LOCKED or reopenedFromLockedStartsAt is set) and participant.revisionUsedAt is null:
    participant.revisionUsedAt = now
  status = CANCELED
  canceledByUserId = currentUserId
  cancelReason = USER_CANCELED
  canceledAt = now
  currentProposalId = null
  finalConfirmRequiredByUserId = null
  clearTurns()
  lastActiveAt = now
  expiresAt = null
  archiveEligibleAt = null
```

### 过期

Active 会话由 `expiresAt` 驱动过期。后台任务或读时收敛逻辑发现 `status = ACTIVE` 且 `expiresAt <= now` 时，必须把会话持久化为 `EXPIRED` 终态：

```txt
Precondition:
  status = ACTIVE
  expiresAt <= now

Action:
  if currentProposalId is non-null:
    current proposal -> SUPERSEDED
    old pending options -> DISABLED
  status = EXPIRED
  expiredAt = now
  currentProposalId = null
  finalConfirmRequiredByUserId = null
  clearTurns()
  lastActiveAt = now
  expiresAt = null
  archiveEligibleAt = null
```

`LOCKED` 会话不走 `EXPIRED`，而是按 `archiveEligibleAt` 归档。

### 归档

归档是 locked 会话在真实世界见面窗口之后的默认收口。进入 `LOCKED` 时，`archiveEligibleAt` 默认为最终确认时间选项的 `endsAt + 1 hour`。

```txt
Precondition:
  status = LOCKED
  confirmedTimeOptionId points to a valid same-session TIME option
  archiveEligibleAt is not null
  archiveEligibleAt <= now

Action:
  status = ARCHIVED
  archivedAt = now
  currentProposalId = null
  finalConfirmRequiredByUserId = null
  clearTurns()
  lastActiveAt = now
```

### 可见性取消

如果举报、拉黑或受限可见性转换影响了 active 或 locked 见面会话，则将会话取消为安全状态：

```txt
status = CANCELED
cancelReason = MATCH_REPORTED | MATCH_BLOCKED | MATCH_LIMITED
canceledAt = now
currentProposalId = null
finalConfirmRequiredByUserId = null
expiresAt = null
archiveEligibleAt = null
clearTurns()
lastActiveAt = now
```

会话仍会被保存，并继续阻止该匹配重新发起见面。

## 选项状态规则

- 当一个时间选项被确认，同一提议中的兄弟时间选项变为 `DISABLED`。
- 当一个地点选项被确认，同一提议中的兄弟地点选项变为 `DISABLED`。
- 被拒绝的提议渲染为灰色卡片。
- 部分接受的提议渲染为已完成的历史卡片：被选中的选项保持高亮，未选择的选项为灰色。
- 被 supersede 的提议渲染为灰色卡片，并带有“已更新”或等价的低强调标签。
- 已确认选项应使用颜色高亮；未选中的兄弟选项应为灰色。

## Web UI 组件

### Dashboard

- `DashboardTodoSection`
- `DashboardTodoItemCard`
- `MeetupTodoCard`

位置：

- 当 `dashboard.tasks.length > 0` 时，在首页靠上位置渲染。
- 当前只有 meetup task，按 `priority` 降序排序。

### 见面页面

路由：

```txt
/dashboard/meetup/[sessionId]
/dashboard/meetup/start?matchId=:matchId
```

组件：

- `MeetupSessionPage`
- `MeetupNegotiationClient`
- `MeetupStatusHeader`
- `MeetupConversationTimeline`
- `MeetupMessageCard`
- `MeetupProposalCard`
- `MeetupOptionCard`
- `MeetupActionPanel`
- `MeetupProposalForm`
- `MeetupLocationCandidatePicker`
- `MeetupAcceptPanel`
- `MeetupFinalConfirmPanel`
- `MeetupLockedSummary`
- `MeetupTerminalState`
- `ConfirmActionDialog`

设计：

- 类似对话的纵向时间线。
- 提议消息使用卡片。
- 当前轮次操作在移动端显示于固定或 sticky 的底部操作区。
- 不使用滑动交互。
- `cancel`、`revise`、`final confirm` 需要明确的二次确认。
- 客户端只有在见面页面可见且会话渲染成功后，才调用 `POST /me/meetup-sessions/:sessionId/seen`。普通 `GET` 请求和预取不得把会话标记为 seen。
- 地点选择使用自研 `MeetupLocationCandidatePicker`。它从 `GET /me/meetup-location-candidates` 读取服务端候选集合，用户只能选择候选项，不加载高德 SDK，不调用高德 API。
- picker 主界面展示地点名称；详情区可展开查看该 candidate 的 `latitude` / `longitude`。空态文案：`请选择见面地点`。校验文案：`请选择一个可用的见面地点。`

### 发起流程

如果用户从没有会话的匹配进入见面流程：

- 展示 `/dashboard/meetup/start?matchId=:matchId`。
- 主 CTA：`安排第一次见面`。
- 通过 `POST /me/matches/:matchId/meetup/start` 提交第一条提议。
- 成功后导航到 `/dashboard/meetup/:sessionId`。
- `/dashboard/match` 可以显示同一个 CTA，但必须链接到 `/dashboard/meetup/start?matchId=:matchId`。
- 如果已存在 `CANCELED`、`EXPIRED` 或 `ARCHIVED` 会话，显示 `本次见面安排已结束，当前版本暂不支持重新发起。`，且不渲染发起表单。

### 匹配页摘要

当存在 `meetupSummary` 时，`/dashboard/match` 应渲染：

- `LOCKED`：显示已确认时间/地点摘要，以及指向 `/dashboard/meetup/:sessionId` 的 `查看见面安排` 链接。
- `CANCELED`、`EXPIRED`、`ARCHIVED`：显示终态文案，不显示重启 CTA。
- `ACTIVE`：紧急首页任务仍是主要入口，但 `/dashboard/match` 仍可显示 `继续安排第一次见面`。

## Toast 合同

使用一个小型本地 toast 系统，或在应用后续采用依赖时使用该依赖。保持克制。

在 dashboard layout 下挂载 `ToastProvider`。toast 区域使用 `role="status"`、`aria-live="polite"`、`aria-atomic="true"`，不抢焦点，任何关闭按钮都有 `aria-label="关闭通知"`。

只在主动用户操作收到成功服务端响应后显示自动消失 toast：

- `见面倡议已发送`
- `已接受这个时间`
- `已接受这个地点`
- `见面安排已确认`
- `修改倡议已发送`
- `已退出本次见面安排`

不要为以下情况显示 toast：

- 刷新后的被动状态变化
- 对方操作
- 提醒
- 校验失败
- 服务端错误

错误应保留在操作区附近的 inline 位置。

确认对话框：

- 使用原生 `<dialog>` 或 `role="alertdialog"`，并带有 `aria-modal="true"`、有标签的标题、有标签的描述、焦点陷阱、焦点恢复、Escape/Cancel 路径。
- 取消 active 标题：`退出本次见面安排？`；描述：`退出后本次见面安排会结束，当前版本不能重新发起。`
- 取消 locked 标题：`取消已确认的见面？`；描述：`取消后本次见面安排会结束，当前版本不能重新发起；这也会计入你的一次修改记录。`
- 修改 locked 标题：`修改已确认的见面？`；描述：`修改后对方需要重新回应；每人每次安排只能修改一次。`

## 邮件提醒

触发条件：

```txt
session.status = ACTIVE
target participant.turnState = REQUIRED
Match.introducedAt is not null
target user's MatchParticipant.contactRequestedAt is null
target participant.responseRequiredAt is not null
target participant.responseRequiredAt <= now - 1 day
target participant.responseRequiredMessageId = session.currentProposal.messageId
session.currentProposal.status = PENDING
target participant.responseRequiredMessageId points to a PROPOSE or REVISE_AFTER_LOCK message from the counterpart
target user has not created an ACCEPT, REJECT, PROPOSE, REVISE_AFTER_LOCK, FINAL_CONFIRM, or CANCEL message after target participant.responseRequiredAt
match visibility is VISIBLE and neither direction is blocked/reported
no reminder already sent for this sessionId
```

`MatchParticipant.contactRequestedAt is null` 是当前表示“未触碰引荐”的事实来源代理，因为发起引荐的用户会设置该时间戳。如果产品后续增加更明确的 introduction-opened 或 introduction-seen 字段，则改用那个字段触发提醒。

查看见面页面或调用 `POST /seen` 不算对提议采取 action，因此不用于抑制提醒。只有改变状态的见面操作才算 action。

实现选项：

- 增加 `MeetupReminder` 表，包含 `sessionId @unique`、`userId`、`sentAt`。
- 或使用 `OutboundEmail.dedupeKey = meetup-reminder:{sessionId}` 并按 dedupe key 查询。

MVP 首选：使用 `OutboundEmail.dedupeKey`；如果仓库已经有后台邮件 flush，再后续增加 scheduled job/service。

提醒按会话去重，不按用户或提议消息去重。同一会话内后续的反提议或锁定后修改提议，在已有该 `sessionId` 的提醒入队后，不得再次入队提醒。

邮件不应暴露超过已引荐匹配本身允许范围的敏感对方信息。不要为已取消、已过期、已归档、已拉黑、已举报或受限可见的匹配排队提醒。

## 安全与访问控制

- `GET session` 只返回当前用户是 `MeetupParticipant` 的会话。
- 每个路由、dashboard task、meetup summary、`/seen`、提醒入队都必须通过可见性 gate：当前用户的匹配可见性为 `VISIBLE`，并且该状态应从源表计算，而不是只信任 snapshot。
- 如果两个匹配用户之间任一方向存在 `Block`，拒绝访问。
- 如果当前用户已举报该匹配，或当前 dashboard 逻辑会限制/打码该匹配，拒绝访问。
- 在举报/拉黑/受限转换时，对任何 active 或 locked 见面会话应用可见性取消迁移。
- 每个 mutation 都检查当前用户的参与者身份。
- Option IDs 必须属于目标会话和当前待处理提议。
- Location candidate IDs 必须来自服务端 `locationCandidates`，不能信任客户端提交的名称或经纬度。
- 用户不能修改已取消、已过期或已归档会话。
- 用户不能在见面开始时间之后修改或取消已锁定会话。
- 除非另建管理员 API，否则绝不通过用户端点向管理员暴露会话。

## 审计事件

增加审计日志：

- `meetup.session_started`
- `meetup.proposal_created`
- `meetup.options_accepted`
- `meetup.proposal_rejected`
- `meetup.final_confirmed`
- `meetup.revised_after_lock`
- `meetup.canceled`
- `meetup.expired`
- `meetup.archived`
- `meetup.visibility_canceled`
- `meetup.seen`
- `meetup.reminder_queued`

元数据只应包含 ID，不包含完整 note 或 secret 值。

## 测试

API 单元测试：

- Start 在 `introducedAt` 之前失败。
- Start 在匹配参与者数量不是正好两个时失败。
- Start 创建参与者和第一条提议。
- Start 在该匹配已存在任意会话时失败，包括 `CANCELED`、`EXPIRED` 或 `ARCHIVED`。
- Start 和 revise 拒绝缺失或非对象类型的 `proposal` 请求体。
- 提议创建拒绝过去时间或落在 30 分钟最小提前量窗口内的时间选项。
- 举报/拉黑/受限可见性后，start、read、mutate、task generation、reminder enqueue 失败或 no-op。
- 举报/拉黑会用系统取消原因取消 active 或 locked 会话，并抑制提醒。
- 并发创建提议不能产生两个 pending/current 提议。
- 针对已 superseded 提议的陈旧 accept/reject 失败。
- 地点 DTO 拒绝缺失、未知或重复的 `locationCandidateId`。
- 服务端创建地点选项时拒绝客户端提交的名称、经纬度、第三方地点来源字段。
- `GET /me/meetup-location-candidates` 返回服务端 hardcode 候选集合，每个 candidate 包含 `id`、名称、`latitude`、`longitude`。
- 用户设置拒绝小于 1 周或大于 4 周的 `meetupExpirationWeeks`，缺失时默认 2 周。
- Active 会话创建和每次状态变更都会用双方设置中较短的一方刷新 `expiresAt`。
- `expiresAt <= now` 的 active 会话会持久化为 `EXPIRED`，并清空轮次。
- 接受一个维度会关闭当前提议、禁用未选择选项、更新 confirmed 字段，并把轮次交回提议者。
- 接受两个维度会设置 `finalConfirmRequiredByUserId`。
- 如果最终 confirmed time 已经开始，accept/final-confirm 失败。
- Final confirm 锁定会话，固化双方设置中较短的 `effectiveExpirationWeeks`，并设置 `archiveEligibleAt = confirmedTime.endsAt + 1 hour`。
- `archiveEligibleAt <= now` 的 locked 会话会持久化为 `ARCHIVED`，并清空轮次。
- 最终确认人可以用 `TIME_ONLY`、`LOCATION_ONLY`、`BOTH` 发起反提议；每种都清空正确的 confirmed IDs。
- Reject 将轮次交回提议者。
- 反提议 supersede 之前的 pending 提议。
- 锁定后修改允许每个参与者在见面时间前执行一次。
- 锁定后修改在参与者已使用 revision 后被阻止。
- 因为 `revisionUsedAt` 持久存在，同一用户重新锁定后也不能再次修改。
- 取消 active 会话可用。
- 在见面前取消 locked 会话可用，并消耗 revision。
- 见面开始后取消 locked 会话失败。
- reopened locked negotiation 中取消仍遵守 `reopenedFromLockedStartsAt`。
- `/seen` 只更新当前参与者的 `lastSeenAt`，不更新 `lastActiveAt`，并返回 `204`。
- Reminder dedupe 使用 `sessionId`，每个 session 最多发送一次，要求当前对方提议经过一天仍无状态改变操作，要求目标用户的引荐触碰信号为空，且不因 `/seen` 被抑制。
- 用户不能访问其他用户的见面会话。

Web 测试或聚焦组件测试：

- 当 `tasks` 包含 meetup 时，Dashboard 渲染 meetup todo。
- 无会话任务链接到 `/dashboard/meetup/start?matchId=...`。
- `/dashboard/match` 为 locked meetup 显示摘要链接，并为 canceled/expired/archived 显示终态文案。
- 时间线渲染 confirmed/rejected/superseded 选项状态。
- 只有在 action 可用时，当前用户才看到 action panel。
- Final confirm/cancel/revise 打开二次确认对话框。
- 地点 picker 从 `GET /me/meetup-location-candidates` 渲染候选项，提交时只发送 `locationCandidateId`。
- 地点详情可以显示 candidate 经纬度，不出现高德 picker 或第三方地图 API 依赖。
- Toast 只在配置的成功 action 后出现。
- 确认对话框有可访问名称/描述、焦点行为、Escape/Cancel 路径。

## 待定决策

当前合同已确定地点来源、过期设置和默认归档时机。仍可在实现时选择过期/归档收敛方式：后台 cron、队列任务，或读时发现后在事务中持久化；无论采用哪种方式，一旦设置为 `EXPIRED` 或 `ARCHIVED`，它就是终态并阻止重启。
