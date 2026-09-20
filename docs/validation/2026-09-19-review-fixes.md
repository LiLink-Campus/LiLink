# 分支审查问题修复

2026-09-19：[上一轮审查](2026-09-19-branch-review-cleanup.md) 的三个 P2 问题均已修复，并完成对应数据库及浏览器回归。本次继续保留原有未提交工作，未提交、推送或部署，未操作生产数据。

**VIP 停用与续费时长。**

新增 [vip-revocation.ts](../../apps/api/src/modules/vip/vip-revocation.ts)，由原 [vip-codes.mjs](../../apps/api/scripts/vip-codes.mjs) 停用命令统一调用。停用仅扣除本卡尚未使用的时长，更新后续卡的到期日；已用完的卡不扣其他卡，重复停用不重复扣减。无需新增数据库字段。

例如 A、B 两张 30 天卡连续兑换：第 10 天停用 A，B 从此时保留完整 30 天；停用尚未开始的 B，A 的到期日不变。时长规则与 CLI 使用方式已更新至 [VIP 说明](../vip-activation.md)。

停用与激活采用一致的用户锁顺序。目标卡逐个加锁后立即核对绑定用户；遇到并发兑换导致归属改变，先释放事务再重试，避免旧快照、遗漏新续费和双撤销锁环。更新到期日、停用标记和审计在同一事务提交。

新增 5 项时段单测、6 项激活/停用 e2e，以及 [双撤销并发专项](../../apps/api/test/vip-revocation-concurrency.e2e-spec.ts)。专项使用有界 gates 固定交错顺序，验证旧归属读取、并发绑定、续费卡锁冲突和重新取得用户锁；不是依赖随机并发碰撞。另实际运行了 CLI dry-run 和 `--apply`：dry-run 不修改数据，应用后仅余一张卡且剩余约 30 天。

**问卷快速切题后的空白。**

[profile-client.tsx](../../apps/web/src/app/dashboard/profile/profile-client.tsx) 统一管理计时器和动画句柄。在手动前进、切模块、重复选择、卸载、定位未完成题，以及 VIP/问卷变化导致题目重建时，同时取消旧计时器和动画；不会留下 `fill: forwards` 的透明样式，也不会由旧回调覆盖新定位。保留正常自动前进和减少动态效果模式。

新增 6 个 smoke 场景，并复验 2 个原有自动切题场景。独立 Chromium 148.0.7778.96 与 WebKit 26.4，在 1280×900 和 390×844 共 24 项检查通过：返回题目可见、opacity=1、无残留动画、无横向溢出、无页面脚本异常。哈希定位同时覆盖本模块和跨模块路径。

**旧库多个生效活动导致发错券。**

[ActivationService](../../apps/api/src/modules/activation/activation.service.ts) 在发现多个 ACTIVE 活动时暂停新增发券，不创建领取记录，不猜选其中一场。[商户活动后台](../../apps/web/src/app/admin/campaigns/page.tsx) 显示冲突数量、暂停原因和处理入口。运营可通过现有“结束此活动”操作保留唯一活动；唯一活动在有效时间窗内时恢复发券。历史活动、已有券和核销记录继续保留。

PostgreSQL 回归验证：旧 A/B 并存时不发券；结束 A 后只发 B；并发领取保持一人一场一张；原有 A 券完整保留。新增两个 Storybook 场景分别覆盖冲突与解决后的状态，并完成 WebKit 桌面/手机四项视觉检查。本次没有自动选择或结束真实活动。

**验证与证据。**

| 检查 | 最终结果 |
| --- | --- |
| API 单测 | 62 套件、569/569 通过 |
| Web 单测 | 13 文件、88/88 通过 |
| PostgreSQL e2e | 完整迁移后的 13 套件、66/66 通过；随后新增双撤销并发专项 1/1 通过 |
| Storybook 全量交互 | 222/222 通过，26 文件通过、1 文件按现有配置跳过 |
| 类型与构建 | API、Web、Storybook 类型检查通过；最终根 `npm run build` 通过 |
| Lint 与 diff | 修改 API 文件及 Web lint 无 error；Web 仅生成文件既有 warning；`git diff --check` 通过 |
| In-app browser | 问卷 6 态、活动 2 态，在 1440×900 与 390×844 的最终可见状态、文字、布局及溢出检查，共 16 项 |
| 独立引擎 | 问卷 Chromium/WebKit 共 24 项；活动 WebKit 共 4 项 |
| VIP CLI | dry-run 无写入、实际停用后权益重算通过 |

完整 API 测试曾触发一项原有测试环境问题：Supertest 在 IPv6 随机端口监听，却经 IPv4 请求同号端口，偶尔撞到本机代理或数据库转发口，出现 403 / socket hang up。仅将该 [限流测试](../../apps/api/src/modules/auth/auth.throttling.spec.ts) 的服务明确绑定 `127.0.0.1`，沿用既有 app.close 清理；没有修改限流业务、代理或系统网络。修复后定向 20/20、完整 API 569/569 通过，详见 [诊断记录](../../artifacts/review-fixes-20260919/auth-throttling-fix.md)。

浏览器场景使用 Storybook 合成 fixture/MSW；数据库测试使用本轮独立 PostgreSQL 容器与无环境文件的隔离源码副本。In-app 手工确认框曾触发工具超时，后续用独立回归场景完成冲突解决状态验证；实际状态转换与保留历史券由 PostgreSQL e2e 验证。不是生产联调、真实 Safari 安装版或物理 iPhone 验收。

- [数据库测试日志](../../artifacts/review-fixes-20260919/e2e-final.log)
- [VIP 并发测试日志](../../artifacts/review-fixes-20260919/vip-revocation-concurrency-e2e.log)
- [CLI 验证日志](../../artifacts/review-fixes-20260919/vip-cli.log)
- [Storybook 全量日志](../../artifacts/review-fixes-20260919/storybook-final.log)
- [In-app 状态与尺寸](../../artifacts/review-fixes-20260919/browser/inapp/results.json)
- [问卷双引擎证据](../../artifacts/review-fixes-20260919/browser/profile-transition-results.json)
- [活动 WebKit 证据](../../artifacts/review-fixes-20260919/browser/campaign-conflict-results.json)

上轮记录的生活习惯问卷发布前置条件、旧轮次报名保留决策，以及团队详情页缺少 Storybook 覆盖，仍按原报告处理。它们不属于此次三个 P2 的代码修复。没有对应远端提交，因此没有本轮远端 CI 结果。

本轮临时 Storybook 服务与 PostgreSQL 容器已停止，现有本地 API、PostgreSQL 和邮件服务保持运行。修改前备份位于 `/tmp/lilink-review-fixes-20260919/before/`，仅本轮增量见 [fix-only.diff](../../artifacts/review-fixes-20260919/fix-only.diff)。
