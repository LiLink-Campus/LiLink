# 邀请渠道分类两层重构（设计 spec · 草案）

> 状态：定稿（派生方案）。codex 的 spec 评审 job 本轮因 runtime 卡住未产出结论；§4 决策由实施方代定为「派生」（低风险、可逆），留待代码阶段 codex review 把关。
> 对应 review P2：个人邀请链接统计渠道分类混合不同维度，建议拆两层——第一层来源（个人邀请/招募/默认活动），第二层分享信息（场景与媒介分开）。
> 范围：渠道**分类与统计/展示维度**的重构，不改变核销系统（P0/P1，已完成）。

## 1. 背景与动机

当前 `ReferralChannel` 枚举把多个正交维度混在一个字段里：

| 枚举值 | 隐含媒介 | 隐含场景 | 来源层 |
| --- | --- | --- | --- |
| WECHAT_MOMENTS | 微信 | 朋友圈 | 未建模 |
| WECHAT_GROUP | 微信 | 群 | 未建模 |
| WECHAT_PRIVATE | 微信 | 私聊 | 未建模 |
| COPY_LINK | （缺失） | 复制链接 | 未建模 |
| QR | （缺失） | 扫码 | 未建模 |
| OTHER | （缺失） | 其他 | 未建模 |

问题：
- **来源层缺失**：PERSONAL（`referredByUserId`）/ RECRUITER（`inviteCodeId`）/ DEFAULT（仅默认活动归因）只隐含在字段关系里，未显式建模；`REFERRAL_SOURCE_TYPES=[PERSONAL,RECRUITER]` 已定义却没启用、且缺 DEFAULT。
- **媒介与场景耦合**：无法独立按"媒介"或"场景"统计。
- **统计维度缺失**：promotion-dashboard 的 funnel 无渠道维度；leaderboard 仅按 source 粗分（硬编码 `'personal'|'recruiter'` 字符串，无 DEFAULT）。

## 2. 目标与非目标

### 目标
1. 显式建模**第一层来源**：`PERSONAL / RECRUITER / DEFAULT`。
2. 把 `channel` 拆为**第二层的两个正交维度**：媒介 `medium` 与场景 `scene`，可独立统计/展示。
3. 统计（promotion-dashboard）与用户端展示能按 source 与 medium/scene 两层查看。
4. 保持 share/click/邀请链接 URL 的对外契约**向后兼容**（不破坏已发出的链接）。

### 非目标（YAGNI）
- 不改核销系统。
- 不改邀请链接 URL 的 `?ch=` 参数形态（沿用现有 channel 值，向后兼容）。
- 不引入 medium×scene 的任意组合扩展（当前仅微信有场景细分）。

## 3. 两层模型设计

### 第一层：来源 source
`REFERRAL_SOURCE_TYPES = ["PERSONAL", "RECRUITER", "DEFAULT"]`（在现有基础上补 DEFAULT）。

派生规则（与现有注册归因优先级一致：招募 > 个人 > 默认）：
```
deriveSource({ inviteCodeId, referredByUserId }):
  inviteCodeId    != null → "RECRUITER"
  referredByUserId!= null → "PERSONAL"
  否则                    → "DEFAULT"
```

### 第二层：媒介 medium + 场景 scene
```
REFERRAL_MEDIUMS = ["WECHAT", "LINK", "QR", "OTHER"]
REFERRAL_SCENES  = ["MOMENTS", "GROUP", "PRIVATE"]   // 仅在 WECHAT 下有意义，其余为 null
```

`channel → { medium, scene }` 规范化映射（保留 channel 作为原始上报值）：

| channel | medium | scene |
| --- | --- | --- |
| WECHAT_MOMENTS | WECHAT | MOMENTS |
| WECHAT_GROUP | WECHAT | GROUP |
| WECHAT_PRIVATE | WECHAT | PRIVATE |
| COPY_LINK | LINK | null |
| QR | QR | null |
| OTHER | OTHER | null |

## 4. 关键决策（待 codex 拍板）：派生 vs 新增字段

**推荐：派生（不新增存储字段）。**
- 来源 source 从 `inviteCodeId`/`referredByUserId` 派生；medium/scene 从已存的 `channel` 派生。
- shared 提供 `deriveReferralSource()` 与 `splitReferralChannel()`，统计与展示在查询/渲染时拆分。
- 理由：① 零迁移、零数据回填风险（现有 `channel`/字段不动）；② 不引入冗余字段的一致性风险；③ referral 事件量级（校园）小，应用层按派生维度分组的成本可忽略。

**备选：新增存储字段**（`ReferralEvent`/`User` 加 `source`、`medium`、`scene` 列 + migration 回填）。
- 优点：DB 层可直接 `group by`，大数据量聚合更高效、可扩展非微信场景。
- 代价：migration + 回填现有数据 + 写入点（share/click/register）都要填、一致性维护。

> **决策：采用派生方案。** 理由：零迁移/零回填、无冗余字段一致性风险、referral 量级小（应用层按派生维度分组成本可忽略），且完全可逆——将来若需 DB 层聚合或非微信场景扩展，再加 `source`/`medium`/`scene` 列即可。本轮 codex spec 评审因 runtime 卡住未产出，故由实施方代定，代码阶段交 codex review 把关。

## 5. shared 变更（`packages/shared/src/referral.ts`）
- `REFERRAL_SOURCE_TYPES` 增加 `"DEFAULT"`；导出类型。
- 新增 `REFERRAL_MEDIUMS`、`REFERRAL_SCENES` 常量与类型。
- 新增纯函数：`deriveReferralSource({inviteCodeId, referredByUserId})`、`splitReferralChannel(channel) → {medium, scene|null}`。
- 把前端硬编码的 `CHANNEL_META`（中文标签 + opensWeChat）迁入 shared，并补 medium/scene 的展示标签，前后端共用。

## 6. api 变更（`promotion-dashboard.service.ts` 等）
- Leaderboard 的 source 维度：从硬编码 `'personal'|'recruiter'` 扩展为 `REFERRAL_SOURCE_TYPES`（含 DEFAULT），DTO 用 shared 枚举校验。
- Funnel/统计：增加按 source 与 medium/scene 的分解（应用层按派生维度分组）。
- referral.service：`resolveRegistrationAttribution` 与事件记录逻辑保持写 `channel`（不变）；如采用派生方案，无需改写入。

## 7. 前端变更
- `ReferralShareSheet.tsx`：`CHANNEL_META` 改从 `@lilink/shared` 引入（去重复硬编码）。
- `referrals-client.tsx` / promotion 看板：统计展示按两层（来源 → 媒介/场景）呈现，复用 origin 的 CSS-module 设计系统（`dcx()`）。
- 邀请链接生成与 `/i/[code]` landing 的 `?ch=` 参数不变。

## 8. 迁移与兼容
- 派生方案：**无 schema 变更、无 migration**；现有 `channel` 数据与已发链接全部兼容。
- 备选方案才涉及 migration + 回填。

## 9. 受影响代码清单（供 writing-plans）
- `packages/shared/src/referral.ts`（枚举、派生/拆分函数、CHANNEL_META）。
- `apps/api/src/modules/promotion-dashboard/`（service 聚合 + dto source 枚举）。
- `apps/api/src/modules/referral/`（如派生方案则基本不动；确认 share/click 仍用 channel）。
- `apps/web/src/app/dashboard/referrals/ReferralShareSheet.tsx`、`referrals-client.tsx`、promotion 看板组件。

## 10. 验收标准
1. shared 导出三类来源、媒介、场景枚举与 `deriveReferralSource`/`splitReferralChannel`，含单测覆盖全部 channel 映射与来源派生分支。
2. 统计端点可按 source（含 DEFAULT）与 medium/scene 两层返回/聚合，有测试。
3. 前端 CHANNEL_META 单一来源（shared），分享 UI 与统计展示按两层呈现。
4. 已发出的 `?ch=` 链接、现有 `channel` 数据照常工作（向后兼容）。
5. shared/api 测试、web typecheck/lint、`next build` 全绿；codex review 通过。
