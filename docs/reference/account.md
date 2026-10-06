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

## 普通用户会话撤销

用户 JWT 必须携带非负整数 `sessionVersion`，Guard 逐请求查询账号版本并严格比对，同时拒绝停用和注销账号。密码重置事务同时消费验证码、更新密码并原子递增版本，新会话使用事务返回的版本。重置成功响应后的新请求使用旧 Cookie 时返回 401；已通过 Guard 的在途请求仍可以完成。

登录密码哈希与签发版本来自同一次账号读取，避免把并发旧密码登录升级成重置后的有效会话。`sessionVersion` 属于内部状态，不进入注册、登录、重置、`/auth/me` 或后台用户更新响应。采用策略 A：所有不带版本的旧用户 JWT 均须重新登录，无宽限期或版本 0 兼容放行。设计、切流边界与安全回滚见[会话撤销决策](../decisions/2026-10-06-user-session-revocation.md)。

## 问卷与报名

定义由 [QuestionnaireService](../../apps/api/src/modules/questionnaire/questionnaire.service.ts) 管理；已提交答案、草稿和当前修订的关注状态具有不同效力。[page-bootstrap controller](../../apps/api/src/modules/account/page-bootstrap.controller.ts) 提供页面聚合；首页进度不等于完整定义或答案。

题目支持 SCALE、SINGLE_SELECT 和 MULTI_SELECT、权重、必填及选项数量约束。后台修改题目通过 [AdminService](../../apps/api/src/modules/admin/admin.service.ts) 创建新 revision 并切换当前版本；用户答案保留其版本与关注状态。当前学校从账号关系注入硬条件，不以旧答案里的学校值替代。学校合并与删除还需通过 [AdminSchoolService](../../apps/api/src/modules/admin/admin-school.service.ts) 同步引用、问卷与缓存，不能只改一张表。

[AccountParticipationService](../../apps/api/src/modules/account/account-participation.service.ts) 在 OPEN 且截止前允许修改本轮状态，报名要求 ACTIVE 账号、明确的 FRIEND/DATE/BOTH 意向，以及当前问卷版本的完整已提交答案。服务端还校验当前学校、必填硬条件和一句话介绍；存在未处理的 `draftAnswers` 时不能报名，须完成或丢弃草稿。取消报名不要求重新通过问卷门槛。匹配资格及优先级见 [匹配参考](matching.md)。

## 注销与历史

[AccountDeletionService](../../apps/api/src/modules/account/account-deletion.service.ts) 在事务中验证密码并串行处理相关匹配：记录注销时间、释放邮箱登录唯一位、挂起账号、消费旧验证码、将相关未完成邮件 outbox 记录标为 EXHAUSTED 并同步快照。已交给 SMTP 的邮件无法通过更新 outbox 撤回。注销不等于删除全部历史数据。

冻结联系信息、举报/拉黑和历史快照由匹配读取与 [DashboardSnapshotService](../../apps/api/src/common/dashboard/dashboard-snapshot.service.ts) 控制。后续资料修改不能重新定义已冻结的历史联系方式。

## 揭晓、联系方式与举报

[揭晓邮件编排](../../apps/api/src/common/mail/queue-match-reveal.ts) 在轮次揭晓事务内复核双方账号、参与资格与任意方向的拉黑。符合条件时将 `introducedAt` 写为揭晓时刻，冻结各自首选联系渠道与值，并创建去重的双方结果邮件；首选非邮箱渠道缺值时回退账号邮箱。网页读取被冻结的渠道，微信等渠道不会额外公开邮箱。旧 `contactRequestedAt` 字段保留在 schema，不构成当前的双向请求门槛。

准备阶段的 `profileSnapshot` 冻结介绍、性别与性别偏好。Dashboard snapshot 则是可重建的用户视图：昵称或学校可随受控更新重新同步，举报、拉黑或对方注销会限制可见性并隐藏参与者敏感字段，不能把整个 Dashboard payload 当成永久不变的原稿。

[MatchReportService](../../apps/api/src/modules/account/match-report.service.ts) 仅允许本人举报已揭晓匹配，事务中锁定匹配并再次检查重复 OPEN 举报。举报写入一条举报人到对方的 Block、取消相关未完成邮件并同步双方快照；任何一方向的 Block 都会排除后续候选。后台核查通过管理员权限处理，账号状态使用 PENDING/ACTIVE/SUSPENDED，不使用旧 BANNED 名称。

问卷保留、全量重填和基础资料回填的发生过程见 [实施记录](../records/README.md)，历史迁移不作为日常请求中的回填机制。
