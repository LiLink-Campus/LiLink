---
kind: reference
lang: zh
canonical: true
---

# 账户、资料与问卷边界

> 文档归属：[现行参考](README.md)。

## 账号与资料

注册负责建立可登录账号；昵称和匹配资料由用户登录后维护。验证码、资格和字段由 [AuthService](../../apps/api/src/modules/auth/auth.service.ts) 与 [Auth DTO](../../apps/api/src/modules/auth/dto.ts) 定义。静态学校展示和缓存不替代服务端资格校验。

学校邮箱通道要求后缀对应 `SchoolDomain` 且学校允许注册；其他邮箱须提供可用个人推荐码并手动选择允许注册的学校。发送验证码前检查推荐人 ACTIVE 和剩余额度，注册事务中按 `nonEduReferralUses < nonEduReferralLimit` 条件递增已用次数，消耗剩余额度，避免并发超额；非学校邮箱新账号的非教育邮箱邀请额度默认为 0。验证码有效 10 分钟，按邮箱、用途和邮件去重键保存 HMAC 摘要并条件消费；密码保存 Argon2 哈希。邮箱或邀请码资格不等同于接入学校学籍核验。

当前注册源码不执行旧 `max_registrations` 全局容量门槛。个人推荐人与渠道在注册时记录，当前 [ReferralService](../../apps/api/src/modules/referral/referral.service.ts) 不把新注册账号绑定商家活动；活动发券使用独立资格判断，见 [优惠券参考](coupons.md)。

账户资料、答案和联系方式分别由 [账户资料](../../apps/api/src/modules/account/account-profile.service.ts)、[账户问卷](../../apps/api/src/modules/account/account-questionnaire.service.ts)、[联系方式](../../apps/api/src/modules/account/contact-preferences.service.ts) 维护。联系方式读取返回 revision，保存按 revision 校验；冲突不能作为覆盖成功。前端反馈须依据保存结果。

## 私有页面 JSON 协议

[共享协议](../../packages/shared/src/private-page-contracts.ts) 是 Dashboard、ContactPreferences、PageBootstrap 及必要摘要的唯一传输类型所有者；API 的 Swagger DTO 继续负责接口说明和请求校验。服务返回路径明确约束共享协议，Prisma 模型和页面草稿不跨越传输边界。API 将 Date 显式投影为 UTC ISO 字符串（`YYYY-MM-DDTHH:mm:ss.sssZ`），保留现有 HTTP JSON 形状。

下表来自真实返回路径。未标注可选的字段均必填；null 和缺失具有不同含义，不因 Web 只消费部分字段而变成可选。

| 入口 | 必填顶层字段及空值 | 返回来源 |
| --- | --- | --- |
| `GET /me/dashboard` | `profile` 对象或 null；`questionnaireSubmittedAt` 日期或 null；`currentCycle`、`lastRevealedRound`、`latestMatch` 对象或 null；`latestMatchVisibility`、`latestMatchLimitedReason` 枚举或 null；`recentMatchHistory` 数组；`couponAgenda` 对象；无 `user` | [Dashboard service](../../apps/api/src/modules/account/account-dashboard.service.ts) |
| `GET /me/bootstrap` | `user`、`dashboard` 对象 | [Account controller](../../apps/api/src/modules/account/account.controller.ts) |
| `GET/PUT /me/contact-preferences` | `revision` 非负整数；`email` 字符串；`preferredContactChannel`；`methods` 数组 | [联系方式 service](../../apps/api/src/modules/account/contact-preferences.service.ts) |
| `GET /me/vip` | VIP 对象；字段与日期规则同下表 | [VIP service](../../apps/api/src/modules/vip/vip.service.ts) |
| `GET /me/page-bootstrap/home` | `user`、`dashboard`、`questionnaireProgress`、`contactPreferences` 对象；`questionnaireAttention` 对象或 null；无完整问卷 | [页面 controller](../../apps/api/src/modules/account/page-bootstrap.controller.ts) |
| `GET /me/page-bootstrap/profile` | `user`、`questionnaire`、`contactPreferences` 对象；`savedQuestionnaire`、`vip` 对象或 null；`dashboard` 仅含 `questionnaireSubmittedAt` 日期或 null | 同上；不读取或修复匹配历史 |
| `GET /me/page-bootstrap/center` | `user` 对象；`vip` 对象或 null | 同上 |

嵌套字段清单如下；所有数组均允许为空，所有日期均为上述格式。

| 对象 | 字段与取值 |
| --- | --- |
| `user` | `id`、`email` 字符串；`displayName` 字符串或 null；`preferredLocale` 为 zh-CN/en-US |
| `profile` | 旧资料对象保留 `id`、`userId`、`createdAt`、`updatedAt`，以及 fullName/headline/bio/schoolYear/programName/pronouns/hometown/genderIdentity/ageMin/ageMax/languages/interests/interestedIn 的既有 nullable 字段；作为 opaque JSON 保留，不新增全站 profile schema |
| `currentCycle` | `id`、`codename`；`revealAt`、`participationDeadline` 日期；`status` 为 DRAFT/OPEN/PREPARING/REVEAL_READY/REVEALED；`participationStatus` 为 OPTED_IN/OPTED_OUT；`intent` 为 FRIEND/DATE/BOTH 或 null |
| `lastRevealedRound` | `cycleId`、`codename`；`revealAt` 日期；`participationStatus`；`matched` 布尔 |
| `match` | `id` 字符串；`score` 数值；`introducedAt` 日期或 null；`reportStatus` 为 OPEN/RESOLVED/DISMISSED 或 null；`participants` 数组 |
| participant | `userId`；displayName/introLine/email/schoolName/gender 均字符串或 null；`contact` 对象或 null；`partnerGenders` 字符串数组；`weeklyIntent` 为 FRIEND/DATE/BOTH 或 null |
| public contact / contact method | 公开联系方式含 `type`（EMAIL/WECHAT/QQ/PHONE）、`label`、`value`；编辑 methods 仅含 `type`（WECHAT/QQ/PHONE）、`value` |
| history item | `cycleId`、`codename`、`revealAt`、`participationStatus`；`result` 为 MATCHED/UNMATCHED/NOT_PARTICIPATED；`visibility` 为 VISIBLE/LIMITED/NOT_APPLICABLE；`limitedReason` 为 REPORTED/BLOCKED/ACCOUNT_DEACTIVATED 或 null；`match` 对象或 null |
| coupon agenda | `target`、`version` 字符串；availableCount/unreadAvailableCount 非负整数；`read` 布尔；`readAt` 日期或 null；`href` 固定 `/dashboard/coupons` |
| VIP | `active`、`advancedFiltersAvailable` 布尔；activatedAt/expiresAt 日期或 null；`durationDays` 非负整数；`priceYuan` 字符串 |
| questionnaire progress | percent/confirmedPercent/unconfirmedPercent 为 0–100 整数；unconfirmedCount 非负整数；submitted/profileReady/missingOneLinerIntro/eligibleToOptIn/hasIncompleteDraft 布尔 |
| questionnaire / saved / attention | 复用 [既有问卷协议](../../packages/shared/src/questionnaire-types.ts)：题目 required、selectionLimit、options 与 saved.vipFiltersActive 可缺失；currentVersionId/submittedAt/draft/attention 的既有 null 含义不变；attention 的 key 数组与 item 布尔字段均必填 |

[轻量 parser](../../packages/shared/src/private-page-parsers.ts) 接入浏览器和 SSR 的上述七条读取/保存路径。未知附加字段保留；允许缺失仅限协议声明的可选问卷字段，null 仅限对应 nullable 字段。非法结构和非法 JSON 进入已有可见错误/重试状态，诊断不记录响应正文；既有 HTTP 错误状态保持。其余 endpoint 不参与该注册表。

持久快照先按 [历史兼容规则](../../apps/api/src/common/dashboard/dashboard-snapshot.payload.ts) 补齐缺失的 gender=null、partnerGenders=[]、weeklyIntent=null、reportStatus=null，再验证输出；未完成 introduction 的历史配对保持隐藏。LIMITED 与举报、屏蔽、注销的权限裁剪继续由快照产生路径负责，不新增迁移。合法历史缺失不等同于损坏值。

私有入口只承认用户会话，管理员或商家 Cookie 不能替代该身份。三种 PageBootstrap 返回 `private, no-store`；Web 私有 fetch 继续使用 no-store。编译期能发现实际生产/消费路径中的必填字段及字段类型不兼容，新增/可选字段和 JSON 序列化仍须外部 E2E 验证。

可重复的 SSR 故障注入使用 `node scripts/e2e/run.mjs --contract-proxy private-contracts.spec.ts --project=chromium --project=mobile-webkit`。该选项只在 runner 的临时 loopback 代理中修改真实 API 响应，按一次性合成会话选择规则；测试证明 Web 服务端到 API 的命中次数，再验证重试后的可见页面。代理不写入生产应用，工件主动保存脱敏字段矩阵和 UI 截图，关闭该 spec 的 trace/video/自动截图。Node 24、npm 11、Docker 和隔离浏览器为前提，数据库、邮件与账号由 runner 一次性建立并销毁。

## 普通用户会话撤销

用户 JWT 必须携带非负整数 `sessionVersion`，Guard 逐请求查询账号版本并严格比对，同时拒绝停用和注销账号。密码重置事务同时消费验证码、更新密码并原子递增版本，新会话使用事务返回的版本。重置成功响应后的新请求使用旧 Cookie 时返回 401；已通过 Guard 的在途请求仍可以完成。

登录密码哈希与签发版本来自同一次账号读取，避免把并发旧密码登录升级成重置后的有效会话。`sessionVersion` 属于内部状态，不进入注册、登录、重置、`/auth/me` 或后台用户更新响应。采用策略 A：所有不带版本的旧用户 JWT 均须重新登录，无宽限期或版本 0 兼容放行。设计、切流边界与安全回滚见[会话撤销决策](../decisions/2026-10-06-user-session-revocation.md)。

## 问卷与报名

定义由 [QuestionnaireService](../../apps/api/src/modules/questionnaire/questionnaire.service.ts) 管理；已提交答案、草稿和当前修订的关注状态具有不同效力。[page-bootstrap controller](../../apps/api/src/modules/account/page-bootstrap.controller.ts) 提供页面聚合；首页进度不等于完整定义或答案。

题目支持 SCALE、SINGLE_SELECT 和 MULTI_SELECT、权重、必填及选项数量约束。后台修改题目通过 [AdminQuestionnaireService](../../apps/api/src/modules/admin/admin-questionnaire.service.ts) 创建新 revision 并切换当前版本；用户答案保留其版本与关注状态。当前学校从账号关系注入硬条件，不以旧答案里的学校值替代。学校合并与删除还需通过 [AdminSchoolService](../../apps/api/src/modules/admin/admin-school.service.ts) 同步引用、问卷与缓存，不能只改一张表。

[AccountParticipationService](../../apps/api/src/modules/account/account-participation.service.ts) 在 OPEN 且截止前允许修改本轮状态，报名要求 ACTIVE 账号、明确的 FRIEND/DATE/BOTH 意向，以及当前问卷版本的完整已提交答案。服务端还校验当前学校、必填硬条件和一句话介绍；存在未处理的 `draftAnswers` 时不能报名，须完成或丢弃草稿。取消报名不要求重新通过问卷门槛。匹配资格及优先级见 [匹配参考](matching.md)。

[资料 reader](../../apps/web/src/app/dashboard/profile/use-profile-reader.ts) 保留完整题目 DOM，按稳定的题目集合和当前选择同步显示，仅在属性值变化时写入 `data-reader-hidden`。普通输入和保存状态变化不重写全题目显示属性；题目集合、VIP 权益或选择改变仍在布局 effect 内同步。导航、自动下一题、目录、未完成定位与输入保存保持；快速导航或题目集合变化取消过时动画，正常及减少动画偏好分别验收。

## 注销与历史

[AccountDeletionService](../../apps/api/src/modules/account/account-deletion.service.ts) 在事务中验证密码并串行处理相关匹配：记录注销时间、释放邮箱登录唯一位、挂起账号、消费旧验证码、将相关未完成邮件 outbox 记录标为 EXHAUSTED 并同步快照。已交给 SMTP 的邮件无法通过更新 outbox 撤回。注销不等于删除全部历史数据。

冻结联系信息、举报/拉黑和历史快照由匹配读取与 [DashboardSnapshotService](../../apps/api/src/common/dashboard/dashboard-snapshot.service.ts) 控制。后续资料修改不能重新定义已冻结的历史联系方式。

## 揭晓、联系方式与举报

[揭晓邮件编排](../../apps/api/src/common/mail/queue-match-reveal.ts) 在轮次揭晓事务内复核双方账号、参与资格与任意方向的拉黑。符合条件时将 `introducedAt` 写为揭晓时刻，冻结各自首选联系渠道与值，并创建去重的双方结果邮件；首选非邮箱渠道缺值时回退账号邮箱。网页读取被冻结的渠道，微信等渠道不会额外公开邮箱。旧 `contactRequestedAt` 字段保留在 schema，不构成当前的双向请求门槛。

准备阶段的 `profileSnapshot` 冻结介绍、性别与性别偏好。Dashboard snapshot 则是可重建的用户视图：昵称或学校可随受控更新重新同步，举报、拉黑或对方注销会限制可见性并隐藏参与者敏感字段，不能把整个 Dashboard payload 当成永久不变的原稿。

[MatchReportService](../../apps/api/src/modules/account/match-report.service.ts) 仅允许本人举报已揭晓匹配，事务中锁定匹配并再次检查重复 OPEN 举报。举报写入一条举报人到对方的 Block、取消相关未完成邮件并同步双方快照；任何一方向的 Block 都会排除后续候选。后台核查通过管理员权限处理，账号状态使用 PENDING/ACTIVE/SUSPENDED，不使用旧 BANNED 名称。

问卷保留、全量重填和基础资料回填的发生过程见 [实施记录](../records/README.md)，历史迁移不作为日常请求中的回填机制。
