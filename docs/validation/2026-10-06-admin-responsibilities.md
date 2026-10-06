---
kind: changelog
lang: zh
---

# 后台与轮次职责拆分

> 文档归属：[验收记录](README.md)。

## 实现前设计与范围

对应 [issue #142](https://github.com/LiLink-Campus/LiLink/issues/142)，基线为 `17ee13bef07c82f4e9189786fc2eddcf86aa4f87`。按用户要求共交付四个 issue PR，本项在单个 PR 中先独立提交 users 页面，再提交 Admin/Cycles 后端职责拆分。Admin 轮次预览直接依赖新的 matching owner，两者作为同一可编译提交交付，避免人为过渡 facade；不改 URL、权限、匹配算法或状态机。

users 页复用 `useAdminCollection` 与 `useAdminSearch`，分离列表筛选、详情读取、编辑动作和呈现。详情异步结果必须归属于所选用户；保存失败保留输入，筛选重置分页及选中项。

Admin 控制器保留类级 AdminGuard，直接调用用户读取、用户修改、轮次读取、轮次管理、问卷发布、举报读取、举报处理、测试数据与运营概览服务。已有学校、审计服务直接复用，删除旧的纯转发入口。问卷发布与用户资料同步的事务保持原所有者；提交后的审计、缓存和快照触发点保持不变。

Cycles 保留真正的状态与调度编排，拆出匹配输入、历史优先级、准备/恢复和揭晓服务。求解仍在准备事务外，揭晓事务仍拥有状态、联系人/引荐、outbox 和审计原子性；快照与 SMTP 均在提交后执行。每个完成拆分的实现文件不超过 500 行。

## 行为覆盖与失败边界

| 外部行为 | 既有覆盖 | 实现前新增缺口 | 工件 |
| --- | --- | --- | --- |
| 用户列表、分页、选中切换、编辑及失败恢复 | admin-user-profile API 集成 | admin-users-workflow 浏览器场景 | 页面与脱敏断言 |
| 用户停用/恢复、邀请额度、详情页签、审计 | 部分既有 API 集成 | admin-users-workflow 保存后回读、旧响应隔离 | 页面、持久化和审计断言 |
| 问卷发布和缓存失效、举报处理 | questionnaire-contract API 集成 | admin-operations 浏览器发布/处置 | 最终页面、版本/审计 |
| 测试数据环境限制与清理边界 | 既有服务行为测试 | admin-operations 合成用户清理/普通用户保留 | 脱敏持久化断言 |
| 报名、求解准备、揭晓、快照和收件 | autumn-match-lifecycle、mail-match-invalidation | admin-matching-lifecycle 驱动真实入口 | 最终用户页、Mailpit 数量和 outbox 终态 |
| 竞争领取、丢失领取、stale 恢复、强制重跑与撤销 | cycles.service、matching-batch 等现有测试 | 复用既有覆盖，不复制算法或内部结构断言 | 既有 suites 输出 |
| 揭晓事务失败、提交后快照失败、SMTP 恢复 | 既有 Cycles/邮件故障场景 | 分别复用，真实收件独立验证 | 事务边界对照及收件 |

实现前 PostgreSQL 基线 `4073cd334498`：5 suites、51 assertions 通过。浏览器新增场景先在未拆分的实现上运行并修正测试数据/定位器；历史基线不作为候选提交通过证据。

## 事务与副作用对照

| 边界 | 保留的语义 |
| --- | --- |
| 准备领取/落库 | OPEN → PREPARING；按 claimUpdatedAt 领取；落库前再次验证，旧 worker 不可提交 |
| 求解 | 事务外有界 worker 执行，未移入长事务 |
| stale 恢复 | 空 PREPARING 阈值与条件更新不变；重复调用仍安全 |
| 揭晓 | 状态、引荐、联系人快照、outbox、审计同一事务 |
| 快照 | 揭晓提交后同步，失败保留惰性修复 |
| SMTP | 事务外投递，沿用幂等键与撤销规则 |
| 强制重跑 | 锁轮次/匹配 → 撤销旧邮件 → 删除匹配/快照 |
| 调度 | 保留 nextAutomationAt、下一轮创建及公开缓存失效位置 |

## 独立交叉审查

2026-10-06，#141 实施代理对 #142 的 Cycles 与 users 拆分进行独立源码审查，未编辑业务实现。对照原 `CyclesService` 与拆分后的七个职责模块，25 个生产方法的函数体在仅调整职责依赖名称和纯 helper 调用后保持等价；逐项复核如下：

| 审查边界 | 源码核对结果 |
| --- | --- |
| 领取与准备落库 | `CyclePreparationService` 保留 OPEN → PREPARING 的条件领取及 claimUpdatedAt；写入匹配和参与者之前再次核对状态与领取时间，丢失领取回滚事务 |
| worker 与 stale 恢复 | 求解继续在持久化事务外执行；空 PREPARING 恢复阈值、状态/updatedAt 条件更新和重复执行语义保留 |
| 揭晓与副作用 | `CycleRevealService` 在同一事务内更新轮次、匹配、联系人/引荐、outbox 和审计；提交后才刷新公开缓存、同步快照与触发 SMTP，快照失败仍保留惰性修复 |
| 强制重跑锁顺序 | 继续按轮次 → 按 id 排序的匹配 → 撤销旧 outbox → 删除匹配/快照处理，不改变撤销与发送资格校验使用的锁顺序 |
| 控制器与依赖注册 | AdminController 保留类级 AdminGuard，直接调用对应职责服务；Admin/Cycles provider 注册齐全，CyclesController 的 cron-secret 校验与调度编排保留 |
| 首次详情与页签读取 | selectedUserId 对应的 effect 保留 cancelled 清理；activeUserDetail.id 限制可见身份，问卷/轮次响应不跨选择回写；延迟首次 GET 的浏览器场景检查旧响应返回后仍显示第二个用户 |

审查发现一项基线已存在、且属于本 issue 旧响应隔离要求的行为缺口：保存用户 A 后的 `reloadUserDetail` 没有请求归属检查。关闭 A、打开 B 后，较晚到达的 A 刷新响应或错误可能覆盖 B 的详情计数、错误与加载状态。原大页面具有同样路径；本次没有把它描述为新增回归或已关闭风险。主代理先增加真实 post-action reload 切换场景，区分 A 的零次参与和 B 的一次参与，并等待旧操作完成后断言；`24fabe326be0` 在 B 原本正确显示 1 后、A 的旧刷新返回时变成 0，确认缺口。随后详情请求按选择生命周期对象、定向动作按选择 epoch 控制回写，切换或卸载使旧请求失效。随后新增已提交写响应延迟的同一用户路径，`55386c0eb322` 发现过早 owner 检查会漏掉全局列表刷新；成功写入后的列表 refresh 保持全局语义，详情、输入、反馈和 pending 回写才受选择归属限制。两名独立代理复核边界；最终候选的两引擎通过工件另行记录。

本轮调用 `cua.createBrowserTab('iab', isolatedServeLogin, { visible: true })` 返回 `Browser is not available: iab`，随后 `cua.listBrowsers()` 返回 `[]`；未控制个人浏览器。桌面与移动目标状态的 in-app browser 视觉验收未执行。隔离 Chromium 与 WebKit 的功能/截图证据分别记录，不能替代 IAB、实际安装的 Safari、实体 iOS 或大陆网络验收。

## 可重复验收

前提为 Node 24、npm 11、Docker；依赖通过 `npm ci` 安装。统一 runner 创建本轮一次性 PostgreSQL、Mailpit、合成账号和临时密钥，不使用开发库或生产库。

```bash
node scripts/e2e/run.mjs admin-users-workflow.spec.ts admin-operations.spec.ts admin-matching-lifecycle.spec.ts admin.spec.ts weekly-cycles.spec.ts matching.spec.ts --project=chromium --project=mobile-webkit
node scripts/e2e/run.mjs --api admin-user-profile.e2e-spec.ts admin-cycle-workbench.e2e-spec.ts questionnaire-contract.e2e-spec.ts autumn-match-lifecycle.e2e-spec.ts mail-match-invalidation.e2e-spec.ts weekly-cycle.e2e-spec.ts
npm run typecheck:api
npm run typecheck:web
npm run lint
```

候选运行记录、命令、浏览器截图、脱敏业务断言及收件数量保存在本机 `artifacts/e2e/<run-id>/`。PR 记录确切候选 SHA、交叉审查、远端 CI 和未执行项。IAB、隔离 Chromium/WebKit 与真实设备覆盖分开报告。最终候选以精确 SHA 工件与远端 CI 为准。

提交前验收：浏览器 `f055547204cb`，桌面 Chromium 与移动尺寸 WebKit 36/36（包括 held reload/write 归属与全局列表刷新）；真实 PostgreSQL 全套 `a61bbd47a10b`，32 suites/162 assertions；既有 API Jest 80 suites/640 assertions，Web 20 files/125 assertions 全部通过。类型检查、lint 与 docs check/verify 通过，Web 保留五个既有警告，文档 preview 唯一既有 public-performance EVD001 已人工核对。详情面板在 320/879/880/1280 像素宽度断言页面无横向溢出、面板边界在视口内；子代理人工检查截图没有新增布局问题。提交后重新生成精确 SHA 工件，不把提交前 dirty 工作区冒充最终候选。
