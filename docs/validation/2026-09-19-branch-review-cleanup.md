# 分支深度审查与冗余清理

2026-09-19 后续更新：下列三个 P2 已完成修复，详见[修复与验收记录](2026-09-19-review-fixes.md)。本文保留修复前发现与复现证据。

审查日期：2026-09-19。结论：清理已完成，保留三个已复现、尚未修复的功能问题，建议修复后再合并。测试通过不能代替这些反例的业务验收。

本次起始分支为 `codex/autumn-2026-ui-implementation`。现场核对 HEAD、main、origin/main 及远端 main 均为 `23765a33ff31b462b53c64e52d5813ec16b186bf`，因此审查对象实际是当前未提交工作区相对 main 的全部变更，包含未跟踪新文件。起始 tracked diff 为 253 个文件、增加 8,226 行、删除 34,954 行；这些不是本次清理产生的数量。原有工作没有被 reset、覆盖或提交。

重点检查了问卷与匹配约束、逐轮报名、揭晓与联系方式冻结、账号注销、邀请和商户发券、VIP 激活与停用、前端逐题交互、注册学校数据和 CI。另有后端、前端、清理三个独立复核任务。没有读取或修改生产数据库，也没有进行真实支付或外部邮件发送。

**1. [P2] VIP 续费后，停用早期卡码不会扣除它贡献的时长。**

位置：[vip.service.ts](../../apps/api/src/modules/vip/vip.service.ts#L63)、[vip-codes.mjs](../../apps/api/scripts/vip-codes.mjs#L27)。激活第二张卡时，其到期日包含第一张的剩余时长；停用脚本仅写第一张的 revokedAt，查询状态仍返回第二张的累计到期日。

隔离 PostgreSQL 复现：连续兑换 A、B 两张 30 天卡，停用 A，剩余未停用卡数量为 1，但到期日仍是首次激活后 60 天。[反例测试](../../artifacts/review-cleanup-20260919/review-findings.e2e-spec.ts) 和 [日志](../../artifacts/review-cleanup-20260919/counterexamples.log) 已保存。单张卡停用测试不能覆盖此场景。

建议明确每次兑换贡献的独立时段，撤销时重新计算剩余权益，并与激活使用相同用户级锁。需要覆盖先后卡撤销、部分消耗、过期以及激活/停用并发。当前 `docs/vip-activation.md` 仍写有效会员拒绝新码，与现行续费实现不一致，修复时应同步文档。

**2. [P2] 取消自动切题后残留透明动画，返回原题会空白。**

位置：[profile-client.tsx](../../apps/web/src/app/dashboard/profile/profile-client.tsx#L1205)。自动跳题对离场元素使用 `fill: "forwards"`，唯一的 animation.cancel 位于延迟回调内。用户在离场期间点击下一题或切模块会清除该回调，但不会清除动画。

复现：进入价值观，选中首题单选项，在 300ms 自动前进延迟结束、160ms 离场动画期间点击下一题，再返回上一题。DOM 已恢复 `data-reader-hidden=false` 和 `display:flex`，计算样式却保持 `opacity=0`，动画状态为 finished。隔离 Chromium 148.0.7778.96（1280×900）与 WebKit 26.4（390×844）均复现。

建议为本次过渡保存动画句柄，在手动导航、模块切换和卸载时同时取消 timer 与动画。[复跑脚本](../../artifacts/review-cleanup-20260919/browser/reproduce-profile-animation.cjs)、[结果 JSON](../../artifacts/review-cleanup-20260919/browser/profile-animation-results.json)、[WebKit 截图](../../artifacts/review-cleanup-20260919/browser/webkit-profile-after.png) 可复核。截图中的保存失败来自 Storybook 保存接口模拟缺口，独立于透明动画问题；不把它计为实际 API 保存故障。

**3. [P2] 旧库多个 ACTIVE 活动没有升级处理，当前活动与实际发券可能不一致。**

位置：[activation.service.ts](../../apps/api/src/modules/activation/activation.service.ts#L57)、[campaign.service.ts](../../apps/api/src/modules/campaign/campaign.service.ts#L284)、[后台当前活动](../../apps/web/src/app/admin/campaigns/page.tsx#L72)。main 合法允许多个 ACTIVE 活动，只限制默认活动唯一；新版本要求唯一当前活动，但仅给后续发布增加锁，没有处理存量。发券无排序取一个 ACTIVE，后台则按创建时间显示最新的 ACTIVE。

隔离库放入旧规则下合法的 A、B 两个活动，实测后台显示更新的 B，用户却获得 A 的优惠券。[复现脚本与日志](../../artifacts/review-cleanup-20260919/legacy-upgrade/README.md) 已保留。该问题以旧库存在多个有效 ACTIVE 为触发条件；没有查询生产库，不能推断线上已命中。建议上线前显式选定唯一活动并保留历史关系，让查询与发券共享相同的活动选择契约，检测异常数据时阻止静默误发。

**已确认的发布前置条件与过渡行为，不重复当作新增缺陷。**

- 生活习惯三题只加入默认 seed 和本地补题脚本，普通 migration 不会更新已存在的问卷。旧问卷缺少三题时，用户仍能设置对方生活偏好，严格筛选会排除缺失字段的候选人；隔离反例已复现。但 [既有验收文档](2026-09-17-profile-lifestyle-vip.md#L16) 已明确要求正式发布前通过后台发布包含三题的新版本。因此应把生产问卷发布及回读验收列为发布前置条件，不能直接用默认 seed 覆盖运营题目。
- main 曾自动产生未来 OPEN 轮次的 OPTED_IN 记录。保留这些记录后，新版用户即使只补问卷、不重新报名，仍可能被匹配。隔离库用 main 原 helper 生成两条报名，随后仅保存问卷，实测产生一对匹配、冻结两个微信联系方式并入队两封邮件（SMTP 模拟，未外发）。[既有实施说明](../2026秋季开学视觉重构/11-正式站实施与验收.md#L25) 明确保留既有报名，因此撤回将其作为 P1 的初步判断；发布时应确认这项保留决策涵盖历史自动报名，并解释与“每轮都要确认报名”界面的过渡关系，不擅自批量取消。
- Storybook 覆盖审计仍缺 `app/about/team/[slug]/page.tsx`，这是审查前已有的覆盖缺口。[审计结果](../../artifacts/review-cleanup-20260919/storybook-coverage.json) 已保留。没有通过添加无效例外来让检查变绿。

**本次完成的清理。**

在已有工作基础上修改 30 个文件，其中删除 2 个废弃文件；本轮专属 diff 为增加 269 行、删除 464 行，净减少 195 行，包含测试更新及格式化，不等于纯死代码行数。详见 [清理清单](../../artifacts/review-cleanup-20260919/cleanup-manifest.json) 和 [仅本次清理 diff](../../artifacts/review-cleanup-20260919/cleanup-only.diff)。

- 删除已无产品入口的 one-to-one 登记弹窗 `registration.tsx` 和配套 CSS；仍被后台使用的 match-leads API 与历史资料保留。
- 删除 4 个闲置图标、4 个闲置插画。它们仅被 Storybook 画廊枚举，没有产品动态或命名引用。
- 删除闲置 CopyTextButton 及专属样式、活动状态常量、后台类型和未使用服务端学校查询 helper。
- 删除未消费的 questionnaireIncompleteMessage 计算及只剩测试调用的辅助函数，测试改为覆盖真实完成度逻辑。
- 删除 referral 内部未使用参数，保留外部 DTO 兼容字段；修正旧活动归因和 sticky 说明，移除发券零模板提前返回后的恒真条件分支。
- 修正 `module` 变量命名和 moduleItems 的稳定依赖，以及 API 现存格式错误。独立复核确认纯格式文件 AST 不变。
- 更新 VIP 数值颜值 fixture、免费/VIP 完成度测试，以及注销入口和学校图表标题两个过期 Storybook 断言。
- 将 CI e2e 数据库及健康检查统一为 `lilink_vip_test_ci`，满足 VIP 测试的防误操作数据库名 guard；否则 CI 会在执行相关测试前主动拒绝运行。

**本轮验证结果。**

| 检查 | 结果与范围 |
| --- | --- |
| Shared 单测 | 110/110 通过；本轮未修改 shared 实现 |
| API 单测 | 61 套件、561/561 通过；最后恒真分支清理后额外复跑 Activation 11/11 |
| Web 单测 | 13 文件、88/88 通过 |
| PostgreSQL e2e | 全部 migration 应用成功；13 套件、59/59 通过 |
| Storybook 交互 | 全量初跑 212/214；两项过期场景断言修正后相关 49/49 通过，未再重复剩余场景 |
| 类型检查 | API、Web、Storybook 全部通过 |
| 最终构建 | 根 `npm run build` 通过，包含 shared、Next.js、NestJS |
| Lint、CSS、diff | API/Web 无 error；Web 仅生成文件既有 warning；修改 CSS 解析及 `git diff --check` 通过 |
| Storybook 覆盖审计 | 未通过：团队成员详情页缺覆盖，见上文 |
| In-app browser | 1440×900、390×844 抽查问卷显示、普通下一题和手机目录弹窗；截图保留 |
| 独立浏览器引擎 | Chromium/WebKit 复现切题缺陷；不声称真实 Safari、物理 iPhone 或全站视觉验收 |
| 数据反例 | VIP、生活题、历史自动报名、多活动共 4 条反例均触发；反例断言通过表示问题/风险复现成功 |

数据库验证使用本轮新建临时 PostgreSQL 容器、隔离源码副本和合成账号，避开主仓环境加载器覆盖 DATABASE_URL 的影响。现有本地展示库与生产库没有被修改。本轮临时 Storybook 服务和 PostgreSQL 容器已停止；复现材料已保留。测试日志、截图和复现脚本位于忽略提交的 `artifacts/review-cleanup-20260919/`；本轮前文件备份位于 `/tmp/lilink-branch-review-20260919/before-cleanup/`。

未 commit、push、merge 或 deploy。当前工作区尚无对应远端提交，因此没有可报告的本轮远端 CI 结果；main 的历史成功不能代替这批变更的 CI。
