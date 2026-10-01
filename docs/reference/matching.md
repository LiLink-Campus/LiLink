---
kind: reference
lang: zh
canonical: true
---

# 匹配资格、计算与优先级

> 文档归属：[现行参考](README.md)。

## 资格与数据时点

每轮需要显式报名与本轮意向，不从上轮自动继承。匹配池排除测试、非 ACTIVE 和注销账号，要求当前问卷版本的完整已提交答案、无未处理草稿和双方硬条件；完整过滤由 `CYCLE_PROCESSING_INCLUDE`、问卷校验与匹配引擎定义。报名后出现问卷版本变化或未完成草稿，也可能使账号在计算时被排除。

后台预演和准备阶段复用 `calculatePairs`；预演按当次数据读取重算，准备阶段持久化结果，揭晓发布。报名、问卷、权益和拉黑变化可能改变输入，预演结果不能保证等于后续揭晓结果。

## 候选过滤与契合分

当前 [硬条件函数](../../packages/shared/src/hard-match.ts) 双向检查性别偏好、身高、可选体重、学校/学校性别排除，以及已设置的吸烟、饮酒、运动偏好；本轮意向另作交集判断。高级筛选先由 [effectiveMatchingAnswers](../../packages/shared/src/profile-preferences.ts) 按有效 VIP 转换，普通或已失效权益的高级偏好还原为不限。国籍和语言的旧答案字段不在当前兼容函数中构成淘汰条件。

年龄与颜值为软偏好加分，不淘汰候选。引擎在基础分上叠加单选相同、量表位置距离、多选交并比和软偏好分，按可比较题目的理论上下界归一化至 70–100，保留一位小数。分数表示问卷契合程度，不是匹配成功概率或关系成功概率。

系统以用户为顶点、兼容候选为边，通过 `edmonds-blossom-fixed` 求一般图最大权匹配。显示契合分与求解边权是两个值；连续落空、VIP 和人数目标只进入边权，不改显示分，也不会先按最高分贪心锁定配对。

## 轮次状态与故障行为

| 状态 | 行为与可见性 |
| --- | --- |
| DRAFT | 后台配置排期，尚未开放报名 |
| OPEN | 截止前可主动报名或取消，时间取本轮 participationDeadline/revealAt |
| PREPARING | 到截止后原子领取处理权，读取资格、计算并持久化配对与资料片段 |
| REVEAL_READY | 准备已完成，结果尚不向用户揭晓；空候选轮次也可进入此状态 |
| REVEALED | 到揭晓时间后原子发布；复核引荐资格、冻结联系方式和邮件 outbox，随后重建用户快照 |

重复 tick 不重复领取或揭晓。continuation 仅在 PREPARING 没有持久化匹配、updatedAt 超过 10 分钟恢复阈值时尝试回收，并用原 updatedAt 比较领取状态；已被其他处理更新则不回收。已有匹配的 PREPARING 走完成准备路径；正常的零配对准备会直接进入 REVEAL_READY。快照重建在揭晓事务外执行，失败时记录诊断并由用户读取补齐缺失覆盖。正常 jobs 还受运行配置开关约束，数据库状态本身不证明调度正在运行。

自动周轮次设置默认关闭；开启后在没有 OPEN、PREPARING、REVEAL_READY 或提前揭晓但 revealAt 尚未到达的轮次时创建下一轮。默认揭晓排期为北京时间周二 21:00，截止可设为提前 1、2 或 24 小时；用户展示与报名仍以具体轮次时间为准。自动创建使用事务 advisory lock，避免并发创建重复轮次，见 [WeeklyCycleService](../../apps/api/src/modules/cycles/weekly-cycle.service.ts)。

`runRevealCycle` 拒绝 DRAFT；OPEN 的 `force` 可绕过截止和揭晓时间边界。对 PREPARING、REVEAL_READY 或 REVEALED 使用 `force` 会取消未投递的匹配邮件，删除该轮 Match 和用户快照，重置 OPEN 后重算，无法撤回已发出的邮件。这是需要明确授权的数据操作；10 分钟空准备恢复阈值不能当作强制重跑的通用操作依据。普通重试、预演、准备和强制重跑具有不同效力，操作及验收见 [隔离发布演练](../guides/release-rehearsal.md)。

## 优先级

在参与资格和双方筛选条件均满足后，系统对整轮候选组合统一求解，按以下顺序选择配对：

1. 最大化连续落空至少 2 次的用户中，本轮匹配成功的人数。
2. 在第一项相同的方案中，最大化有效 VIP 用户的匹配成功人数。
3. 在前两项相同的方案中，最大化整轮匹配人数。
4. 在前三项相同的方案中，优化问卷契合度及原有的小幅加权。

这意味着第三次参加时就会获得落空优先权。连续落空按已报名、已揭晓的轮次计算；跳过一轮不增加或清零，匹配成功后重新从零累计。落空 2 次及以上属于同一优先层，不再用落空次数长短覆盖后续 VIP 和人数目标。

VIP 状态与高级筛选使用同一次资格判断：存在未停用且尚未过期的权益。免费、已到期、已停用用户不享受 VIP 优先权。VIP 可以匹配满足双方条件的普通用户，也可以匹配 VIP；不预先锁死某一对，以便在不牺牲前两项的前提下保留更多其他配对。已准备完成的轮次不会因之后权益变化自动重算。

优先权不会绕过双方硬条件、拉黑或历史配对排除，也不保证必定匹配。它只影响配对选择，不修改展示的契合分。原有首次参加每人加 6、落空 1 次加 2 的小幅加权仍放在最后一层。

实现：[matching.engine.ts](../../apps/api/src/modules/cycles/matching.engine.ts)、[cycles.service.ts](../../apps/api/src/modules/cycles/cycles.service.ts)。

验证：[优先级与穷举对照](../../apps/api/src/modules/cycles/matching.engine.spec.ts)、[历史与权益单测](../../apps/api/src/modules/cycles/cycles.service.spec.ts)、[数据库揭晓与用户首页结果](../../apps/api/test/matching-priority.e2e-spec.ts)。数据库测试仅可在独立的本地 `lilink_e2e_*` 或 API CI 使用的 `lilink_vip_test_*` 数据库、非 `5432` 端口运行。
