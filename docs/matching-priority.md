# 自动匹配优先级

在参与资格和双方筛选条件均满足后，系统对整轮候选组合统一求解，按以下顺序选择配对：

1. 最大化连续落空至少 2 次的用户中，本轮匹配成功的人数。
2. 在第一项相同的方案中，最大化有效 VIP 用户的匹配成功人数。
3. 在前两项相同的方案中，最大化整轮匹配人数。
4. 在前三项相同的方案中，优化问卷契合度及原有的小幅加权。

这意味着第三次参加时就会获得落空优先权。连续落空按已报名、已揭晓的轮次计算；跳过一轮不增加或清零，匹配成功后重新从零累计。落空 2 次及以上属于同一优先层，不再用落空次数长短覆盖后续 VIP 和人数目标。

VIP 状态与高级筛选使用同一次资格判断：存在未停用且尚未过期的权益。免费、已到期、已停用用户不享受 VIP 优先权。VIP 可以匹配满足双方条件的普通用户，也可以匹配 VIP；不预先锁死某一对，以便在不牺牲前两项的前提下保留更多其他配对。已准备完成的轮次不会因之后权益变化自动重算。

优先权不会绕过双方硬条件、拉黑或历史配对排除，也不保证必定匹配。它只影响配对选择，不修改展示的契合分。原有首次参加每人加 6、落空 1 次加 2 的小幅加权仍放在最后一层。

实现：[matching.engine.ts](../apps/api/src/modules/cycles/matching.engine.ts)、[cycles.service.ts](../apps/api/src/modules/cycles/cycles.service.ts)。

验证：[优先级与穷举对照](../apps/api/src/modules/cycles/matching.engine.spec.ts)、[历史与权益单测](../apps/api/src/modules/cycles/cycles.service.spec.ts)、[数据库揭晓与用户首页结果](../apps/api/test/matching-priority.e2e-spec.ts)。数据库测试仅可在独立的本地 `lilink_e2e_*` 或 API CI 使用的 `lilink_vip_test_*` 数据库、非 `5432` 端口运行。
