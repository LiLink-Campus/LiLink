---
kind: reference
lang: zh
canonical: true
---

# 账户、资料与问卷边界

> 文档归属：[现行参考](README.md)。

## 账号与资料

注册负责建立可登录账号；昵称和匹配资料由用户登录后维护。验证码、资格和字段由 [AuthService](../../apps/api/src/modules/auth/auth.service.ts) 与 [Auth DTO](../../apps/api/src/modules/auth/dto.ts) 定义。静态学校展示和缓存不替代服务端资格校验。

账户资料、答案和联系方式分别由 [账户资料](../../apps/api/src/modules/account/account-profile.service.ts)、[账户问卷](../../apps/api/src/modules/account/account-questionnaire.service.ts)、[联系方式](../../apps/api/src/modules/account/contact-preferences.service.ts) 维护。联系方式读取返回 revision，保存按 revision 校验；冲突不能作为覆盖成功。前端反馈须依据保存结果。

## 问卷与报名

定义由 [QuestionnaireService](../../apps/api/src/modules/questionnaire/questionnaire.service.ts) 管理；已提交答案、草稿和当前修订的关注状态具有不同效力。[page-bootstrap controller](../../apps/api/src/modules/account/page-bootstrap.controller.ts) 提供页面聚合；首页进度不等于完整定义或答案。

[AccountParticipationService](../../apps/api/src/modules/account/account-participation.service.ts) 在 OPEN 且截止前允许修改本轮状态，报名要求 ACTIVE 账号、明确的 FRIEND/DATE/BOTH 意向，以及当前问卷版本的完整已提交答案。服务端还校验当前学校、必填硬条件和一句话介绍；存在未处理的 `draftAnswers` 时不能报名，须完成或丢弃草稿。取消报名不要求重新通过问卷门槛。匹配资格及优先级见 [匹配参考](matching.md)。

## 注销与历史

[AccountDeletionService](../../apps/api/src/modules/account/account-deletion.service.ts) 在事务中验证密码并串行处理相关匹配：记录注销时间、释放邮箱登录唯一位、挂起账号、消费旧验证码、将相关未完成邮件 outbox 记录标为 EXHAUSTED 并同步快照。已交给 SMTP 的邮件无法通过更新 outbox 撤回。注销不等于删除全部历史数据。

冻结联系信息、举报/拉黑和历史快照由匹配读取与 [DashboardSnapshotService](../../apps/api/src/common/dashboard/dashboard-snapshot.service.ts) 控制。后续资料修改不能重新定义已冻结的历史联系方式。

问卷保留、全量重填和基础资料回填的发生过程见 [实施记录](../records/README.md)，历史迁移不作为日常请求中的回填机制。
