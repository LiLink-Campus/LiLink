# 冗余测试与内部兼容代码清理

本文件保留第一轮清理完成时的验收快照；后续职责拆分见 [深度清理记录](2026-09-26-deep-cleanup.md)。用户随后授权提交 PR，提交和远端 CI 状态以关联 PR 为准。

## 目标与边界

基线为 `8c469591`，分支为 `codex/cleanup-redundant-tests-compat`。保持现有用户行为、HTTP 契约、持久化数据格式和无障碍名称，只清理经调用关系与保留测试证明多余的内部路径。不新增依赖、不修改数据库迁移、不提交或发布。

## 实施前计划

1. 运行现有 shared / API 定向测试，以及资料选择器在桌面 Chromium、移动尺寸 WebKit 的选择、保存、刷新回读 E2E，锁定现有行为。
2. 删除前端未读取的 `accentGradient` 类型字段及三个配置值。
3. 将资料页全部八处 `ValuePicker.sheetTitle` 原值传给现有 `ariaLabel`，删除旧属性与后备分支。原生 select、placeholder 与无障碍名称保持一致。
4. API 调用方直接导入 `@lilink/shared`，删除 questionnaire 的 `tryReadHardMatchAnswers` 单纯转调函数和 shared 转导出层；保留 API 的提交规范化、草稿清洗、校验错误转换。独立 diff 审阅发现 release CPU benchmark 也在使用此内部函数，同步迁移脚本并用重新构建的 API 运行其现有匹配完整性断言。
5. 删除 `health.controller.spec.ts`：保留 `health.e2e-spec.ts` 的真实 Nest HTTP 路由断言，覆盖原测试全部三个字段检查。
6. 保留 API hard-match 测试。逐项核对后发现，稀疏对象解析与双方均有体重的匹配场景，和 shared 的非法值 / 空体重场景不同，不能整项视为冗余。
7. 运行保留测试、类型检查、lint、隔离 E2E；独立审阅 diff，记录证据与未验证项。

计划作者与代码实现、独立审查分开：根代理记录计划并负责验收，子代理审阅计划与最终 diff；实现按 API / Web 文件所有权划分。

## 兼容路径分类

| 路径 | 分类 | 处理 |
| --- | --- | --- |
| `ValuePicker.sheetTitle` | 旧内部参数兼容，所有调用方可原子迁移 | 删除，统一 `ariaLabel` |
| `tryReadHardMatchAnswers` / shared 转导出 | 无变换的内部间接依赖 | 调用方直连 shared，删除包装 |
| `accentGradient` | 未被运行代码读取的数据 | 删除 |
| referral legacy 字段 | 外部客户端契约兼容 | 保留 |
| 问卷旧答案、旧匹配与邮件记录读取 | 持久化数据与隐私边界兼容 | 保留 |
| CSS 浏览器测试、web/shared profile-preferences 测试 | 分别覆盖实际渲染和不同层行为 | 保留 |

## 结果与保留覆盖

完成上述清理，源码、测试及脚本共 18 个文件，净减少 49 行；另新增本验收记录。没有新增测试、依赖或兼容包装。独立计划审阅通过；最终 diff 审阅发现 benchmark 遗漏引用，修复并实际运行后复审通过。

删除的唯一测试文件 `health.controller.spec.ts` 包含 1 项测试，原来的 `ok`、`service`、ISO timestamp 断言全部保留在 `test/health.e2e-spec.ts`，并通过 HTTP 验证。其他测试场景未删除。

API 改动涉及 questionnaire 的内部包装及 account、match-estimate、cycles、matching.engine、dashboard、mail 的直接导入和对应测试导入；release benchmark 同步迁移。Web 改动仅涉及 `ValuePicker.tsx`、其八处资料页调用和 `weekly-intent.ts` 的未使用字段。

## 验收环境与证据

环境：macOS arm64，Node 24.20.0、npm 11.19.0、Playwright 1.60.0。Docker 可用。E2E 运行器从当前未提交工作区复制源码，临时启动 PostgreSQL 17 / Mailpit 并构建 API 与 Web。所有测试使用合成数据、随机 loopback 端口；浏览器数据库为 `lilink_e2e_<run-id>`，当前运行器的 API-only 模式使用 `lilink_vip_test_<run-id>`。未使用现有开发或生产数据库。三轮 E2E 的容器与临时源码副本均已回收。

| 检查 | 结果 | 本地证据 |
| --- | --- | --- |
| 实施前 shared | 110 项通过 | `artifacts/cleanup-20260926/shared-before.log` |
| 实施前 API 定向测试 | 7 suites / 155 项通过 | `artifacts/cleanup-20260926/api-before.log` |
| 实施前选择器浏览器 E2E | 2 项通过，0 flaky | `artifacts/e2e/42f1ecf59e5d/` |
| 清理后 API 全量既有 Jest | 70 suites / 651 项通过 | `artifacts/cleanup-20260926/api-after.log` |
| 清理后 Web 全量既有 Vitest | 20 files / 125 项通过 | `artifacts/cleanup-20260926/web-after.log` |
| API / Web / Storybook 类型检查 | 通过 | `artifacts/cleanup-20260926/*typecheck.log` |
| API / Web lint | 通过，Web 有 5 条未改动文件中的警告 | `artifacts/cleanup-20260926/{api,web}-lint.log` |
| API 隔离 E2E | 4 suites / 12 项通过 | `artifacts/e2e/57f82d029ac0/{run.json,tests.log}` |
| 清理后选择器浏览器 E2E | 2 项通过，0 failed / skipped / flaky | `artifacts/e2e/26526ba5ba34/{run.json,results.json,report/index.html}` |
| release CPU benchmark | 500 / 1000 / 2000 人，分别 250 / 500 / 1000 对，候选计数及配对唯一性通过 | `artifacts/cleanup-20260926/benchmark-after.log` |
| API build、脚本语法、diff 空白检查与引用核对 | 通过；运行代码无旧名称残留 | `artifacts/cleanup-20260926/api-build.log` 及独立 diff 审阅 |

数据库测试覆盖健康路由、问卷配置与标签变更契约、历史资料恢复保留较新编辑、匹配优先级直到揭晓和 dashboard 结果。浏览器测试覆盖自身身高 / 体重的题目切换、选择、自动保存、刷新回读和“选择你的体重”无障碍名称；桌面 Chromium 为 1280×800，移动尺寸 WebKit 为 iPhone 13 模拟配置 390×664。其余六处选择器名称通过等值 diff 与类型检查核对，不声称全部经过浏览器操作。

## 复跑命令

前提：在仓库根目录，已安装依赖和 Chromium / WebKit，Docker 正在运行。不要直接将 E2E 指向现有数据库。以下浏览器命令精确选择本轮实际运行的两项；完整原始参数记录在各自 `run.json` 中。

```sh
npm run test:shared
npm run test --workspace api -- --runInBand
npm run test --workspace web
npm run typecheck:api
npm run typecheck:web
npm run typecheck:storybook:web
npm run lint:api
npm run lint:web
node scripts/e2e/run.mjs --api --runTestsByPath \
  test/health.e2e-spec.ts test/questionnaire-contract.e2e-spec.ts \
  test/profile-basics-reuse.e2e-spec.ts test/matching-priority.e2e-spec.ts
node scripts/e2e/run.mjs e2e/specs/profile.spec.ts \
  --project=chromium --project=mobile-webkit --grep 'question pickers'
npm run build:shared
npm run build:api
node --check scripts/release/benchmark-worker.mjs
(cd apps/api && node ../../scripts/release/benchmark-worker.mjs)
git diff --check
```

## 限制与保留事项

- 本轮保持渲染与业务行为，只做内部依赖/参数清理，没有新增视觉状态；未执行 IAB 视觉检查、安装版 Safari 或实体手机检查。
- Web lint 警告来自未改动的 `mockServiceWorker.js`、邀请落地页和商户核销页；数据库 E2E 出现既有 `pg` 并发查询弃用警告，测试通过。本轮不扩展到这些路径。
- CPU benchmark 仅验证匹配器脚本运行和结果完整性，不作为线上容量或性能提升结论。没有修改认证、授权或输入验证边界，未运行额外安全扫描。
- 外部 referral 契约、历史数据库记录、旧匹配邮件的必要兼容逻辑保留。未提交、推送或部署，远程 CI 未触发。
