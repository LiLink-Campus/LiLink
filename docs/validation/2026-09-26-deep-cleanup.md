# 资料页与账户模块职责拆分

本文件记录第二轮本地清理与验收；用户随后授权提交 PR，提交和远端 CI 状态以关联 PR 为准。下文的未提交状态指本地验收完成时的快照。

## 范围与成功条件

继续在 `codex/cleanup-redundant-tests-compat` 工作，保留第一轮全部改动。当前资料页 `profile-client.tsx` 2057 行，`account.service.ts` 1680 行，混合多个不同生命周期的职责。本轮原子拆分这两个入口，清理已证明不可达的内部兼容逻辑和纯构造/重复转发测试。目标是改动模块每个生产代码文件不超过 500 行、职责可命名、依赖单向、现有用户结果和外部契约不变。其他管理员/匹配大类不同时重写。

不新增依赖、数据库迁移、对旧内部类的兼容门面；不改样式、文案、公开路由和权限。仅新增实施前已识别的浏览器行为覆盖缺口，不新增 hook 或拆分结构的单元测试。不提交、推送或部署。

## 设计决策

原则：按业务职责和状态所有权拆分；避免循环依赖及巨大 context；事务和卸载/竞态保护必须整体保留；删除测试按行为覆盖判定，不按行数或框架判定。

考虑的方案：

- 仅提取文件末尾的 helper / JSX：改动小，但生命周期和职责仍全部留在原入口，不能解除 god class。
- 按职责拆成领域服务、状态 hook 与表单组件（采用）：调用方原子迁移，可清除旧类与内部门面；代价是需要验证 DI、回调时序、refs 和事务完整性。
- 引入通用表单引擎或所有状态共享 context：会制造新的抽象层和跨组件隐式耦合，本轮没有第二个真实用例支持，排除。

### 前端状态与组件边界

- 页面入口只拥有编辑中的 answers / hardMatchForm / displayName，组合组件和协作回调。
- self / partner / values / school-exclusions 分别渲染自己的表单，使用显式 props；school 独占搜索和匹配估算请求。
- autosave hook 独占 debounce、序列化快照、队列、abort、超时、重试、已保存状态，只通过普通 `onSaved({ result, payload, snapshot })` 事件报告成功；权重确认读取该次实际保存的 payload，不使用回调时的最新表单。
- 页面持有一份稳定的字段 DOM registry（或一个小型 registry hook），为 refs 注册、attention observer、reader 定位提供同一节点来源；不共享业务可变状态。未完成项从当前表单纯计算，独立于 attention observer。
- reader hook 独占题目索引、模块切换、目录、hash 定位、焦点与动画；只依赖 DOM registry 查询与未完成项，不读取表单或发保存请求。
- attention hook 独占签名确认和可视确认，接收 reader 当前 tab 与稳定 registry，保留自己的卸载 guard；不得把 React useEffectEvent 返回给其他 hook 使用。依赖方向为 reader → 页面组合 → attention，禁止两个 hook 互传结果形成闭环。
- navigation / save notice / VIP dialog 是可组合的视图；复用实际重复的目录题号列表，避免传递整个页面 controller 对象。
- VIP access hook 独占会员状态、focus/间隔刷新与过期定时器，VIP dialog 仅负责弹窗展示与关闭；不将会员生命周期重新放入页面总控制 hook。
- 所有模块仍始终渲染，通过 hidden/data-reader-hidden 控制，保留 DOM 顺序、字段 ID、ref 注册顺序、CSS 类和无障碍名称。

### 后端领域边界

- profile：用户摘要、语言和基础资料。
- dashboard：周期结果、历史卡片和快照修复读取。
- contact preferences：联系方式读写、规范化及 revision 冲突。
- questionnaire：草稿/提交/回读/确认；draft、attention、昵称约束为纯领域函数。
- participation：报名资格与报名写入、缓存失效。
- match report：参与者校验、行锁、去重、举报/屏蔽/审计/邮件取消/快照更新的完整事务。
- controller 直接注入相应服务，删除 AccountService；领域服务之间不互相转发。
- 删除 getQuestionnaire 已拒绝旧版本后仍存在的跨版本 attention 比较分支，保留 enum signature / weight 确认和旧版本返回 null 的契约。保留数据恢复、冻结快照与必要可选依赖。

## 测试清理映射

| 删除候选 | 保留的行为证据 |
| --- | --- |
| questionnaire.controller.spec.ts 的 1 项纯转发 | profile-choice-rules 浏览器测试读取真实 current 问卷并验证题目和保存 |
| public.controller.spec.ts 的 2 项纯转发 | admin 浏览器测试验证 landing 周期变化；community 验证学校接口与注册识别 |
| auth.controller.spec.ts 的 requestCode 2 项、register token/cookie 1 项 | auth-registration-validation HTTP 契约测试逐项覆盖；保留 locale 和 login/reset 的独特边界 |
| admin-analytics.controller.spec.ts 的构造测试 1 项 | 无业务断言；实际模块启动及保留的 controller/service 测试覆盖构造 |

Account 与 page-bootstrap 测试保留并迁移依赖：包含用户身份映射、VIP 局部失败、核心错误传播等独特边界。现有 account service 测试按真实职责迁移，避免复制大份 fixture 或制造结构锁定测试。

## 实施前失败方式与验收

1. hook 抽取丢失卸载保护或覆盖最新编辑：复用保存失败恢复、快速返回、刷新回读；明确新增延迟 A 响应、输入 B、放行 A 后等待 B 保存，刷新与 API 回读均为 B 的行为用例。
2. reader/attention 拆分导致定位错误或误确认权重：新增 hash 跨模块定位和权重可视后仍待显式保存的浏览器断言。
3. 学校组件越权或保存丢失：新增非 VIP 修改拦截、VIP 学校搜索/排除后刷新回读。
4. 服务接线/事务拆分改变隐私与并发：现有全量 API 隔离 E2E 包含举报邮件失效、联系 revision 并发、问卷历史恢复、匹配优先级和停用保护。

基线和结果保存至 Git 忽略的 `artifacts/deep-cleanup-20260926/` 及独立 E2E 运行目录。前端固定回归使用 Node + Playwright、桌面 Chromium 与移动尺寸 WebKit；不访问个人浏览器。所有 DB E2E 通过统一 runner 的 disposable PostgreSQL 执行。

实施顺序：记录计划 → 独立架构审阅 → 独立批判审阅 → 保留/补齐行为基线 → API 与 Web 独立实现 → root 集成、lint/typecheck/build/E2E → 最终独立 diff 审阅。当前 App 原生执行，不创建 OMX 持久模式状态或目标；审阅是质量证据，执行授权来自本轮用户请求。

## 执行证据

### 实施前审阅与行为基线

计划由 root 编写，独立 architect 审阅后落实 DOM registry、真实保存 payload、VIP 生命周期及保存竞态四项条件，再由独立 critic 批准。实现人员未承担计划审批。

内部兼容分支处理：旧版问卷在入口已返回 null，其后的跨版本 attention 比较不可达，本轮删除。资料保存的 BFF 首次请求/直连重试、VIP 权益回读、历史快照恢复与数据库事务冲突属于现有运行边界，保留并用原有行为测试验收，不将其作为冗余兜底删除。

| 基线 | 结果 | 工件 |
| --- | --- | --- |
| 全量 API 隔离 E2E | 29 suites / 155 passed | `artifacts/e2e/9b616696cae9` |
| profile / profile-mobile / profile-choice-rules / contact-navigation / vip / matching；Chromium + mobile-webkit | 80 passed | `artifacts/e2e/9a15c8bee849` |
| admin / community；同两引擎 | 8 passed | `artifacts/e2e/dcd5afae30b3` |
| 新增 profile-boundaries 的四种行为；同两引擎 | 8 passed | `artifacts/e2e/0b8d5f2e0530` |
| 待精简 controller 单元测试 | 精简前 14 passed；精简后保留 7 passed | `artifacts/deep-cleanup-20260926/redundant-test*.log` |

新增浏览器基线曾因测试定位错误失败：全页 summary 匹配到导航、原生 checkbox 被实际点击标签覆盖、相同路径的 hash 跳转被误当成刷新。修正为当前题目内定位、点击可见标签、显式 reload 后，两引擎 8 项全部通过；未修改生产代码或放宽持久化断言。截图包含免费用户 VIP 拦截弹窗和会员学校筛选刷新回读。

### 实施后验证

后端已删除旧 `account.service.ts` 与 3148 行集中测试文件。controller / page-bootstrap 直接注入六个服务；旧 44 个账户行为场景迁移至 12 个按行为命名的测试文件。草稿 helper 接收已清洗的数据，校验调用留在问卷服务，未引入转发门面或通用回调层。独立审阅确认事务、路由、身份来源与测试主体保持一致。

| 检查 | 结果 | 工件 |
| --- | --- | --- |
| API 全量 Jest | 79 suites / 644 passed，比本轮基线少 7 项 | `artifacts/deep-cleanup-20260926/api-after.log` |
| API 全量隔离 E2E | 29 suites / 155 passed | `artifacts/e2e/0b09a3619954` |
| 草稿边界收窄后：问卷原有测试 | 5 suites / 13 passed | `artifacts/deep-cleanup-20260926/api-questionnaire-boundary.log` |
| 草稿边界收窄后：会员资料、基础资料复用、匹配生命周期隔离 E2E | 3 suites / 20 passed | `artifacts/e2e/5d7d76a0e3a4` |
| API 类型检查 / 全量 lint / 收尾两文件 lint | 通过 | `artifacts/deep-cleanup-20260926/api-typecheck.log`、`lint-api.log`、`api-questionnaire-boundary-lint.log` |
| 前端完整相关浏览器回归（两引擎） | 96 passed，0 skipped / failed / flaky | `artifacts/e2e/1003b2a3663d/report/index.html`、`results.json` |
| Web 原有测试 | 20 files / 125 passed | `artifacts/deep-cleanup-20260926/test-web.log` |
| Web / Storybook 类型检查 | 通过 | `typecheck-web-final.log`、`typecheck-storybook.log` |
| Web 全量 lint / 最后收窄接口的 lint | 通过；全量仅 5 条已有警告，新模块 0 警告 | `lint-web.log`、`lint-profile-final.log` |
| API / Web 构建 | 通过 | `api-fixture-move-build.log`、`build-web-final.log` |
| fixture 移至测试目录后 | 原 44 账户测试、API 类型检查及 lint 通过；生产产物无 fixture | `api-fixture-move-{tests,typecheck,lint}.log` |
| 设计系统边界（实际前端源码） / diff / 旧符号扫描 | 通过；apps/scripts/packages 无旧类、旧 parser wrapper 或 sheetTitle | `lint-web-boundary-source.log`、`changed-files.json` |

表内短日志路径均在 `artifacts/deep-cleanup-20260926/`。机器可读摘要为该目录的 `summary.json`。浏览器快照生成后仅删除三个无人使用的 hook 返回字段，并重新通过 Web 类型检查、相关 lint 和构建；运行逻辑保持不变。

### 最终模块边界

| 入口或职责 | 最终结果 |
| --- | --- |
| ProfileClient | 2057 → 271 行，仅编辑状态与组合 |
| self / partner / values / school | 独立表单组件，最大 382 行；学校组件独占搜索、排除转换及匹配估算请求 |
| autosave / attention / reader / VIP / registry | 各自管理生命周期；仅暴露调用方实际使用的接口 |
| 目录 / 保存提示 | 两处目录复用题目列表；状态提示集中渲染 |
| AccountService | 删除原 1680 行类；profile / dashboard / questionnaire / participation / contact / report 六服务，最大 444 行 |
| 账户测试 fixture | 放入 `apps/api/test/fixtures/account`，不进入生产构建，不被生产源码引用 |

独立前端审阅确认依赖方向、保存 payload、生命周期、DOM 挂载与完成提示；独立 API 审阅确认事务及调用方迁移，并复查草稿函数边界修正。新增/拆分的生产与账户测试文件均小于 500 行。没有新依赖、迁移、公开协议变更或内部兼容门面。

### 重复运行

环境：macOS、Node 24.20.0、npm 11.19.0、Playwright 1.60.0；Docker 可用，已安装隔离 Chromium/WebKit 引擎。先安装仓库依赖。统一 runner 为每次运行创建临时 PostgreSQL 17、Mailpit、合成账号和随机 loopback 端口；测试后删除容器及临时工作区，保留报告。不得把命令改为连接现有开发或生产数据库。

```sh
npm run test --workspace api -- --runInBand
node scripts/e2e/run.mjs --api
npm run test --workspace web
npm run test:e2e:infra
npx tsc -p e2e/tsconfig.json
node scripts/e2e/run.mjs e2e/specs/profile.spec.ts e2e/specs/profile-mobile.spec.ts e2e/specs/profile-choice-rules.spec.ts e2e/specs/contact-navigation.spec.ts e2e/specs/vip.spec.ts e2e/specs/matching.spec.ts e2e/specs/admin.spec.ts e2e/specs/community.spec.ts e2e/specs/profile-boundaries.spec.ts --project=chromium --project=mobile-webkit
npm run typecheck:api
npm run typecheck:web
npm run typecheck:storybook:web
npm run lint:api
npm run lint:web
npm run lint:web-boundary -- apps/web/src
npm run build:api
npm run build:web
git diff --check
```

`lint:api` 会格式修复，运行后需检查 diff。独立运行 app build 前需先 `npm run build:shared`；上述类型检查已先构建 shared。浏览器默认桌面 1280×800、移动 iPhone 13 配置，并由现有布局用例覆盖 320–1440 宽度及 879/880 断点。

### 截图与验证边界

截图保存在 `artifacts/deep-cleanup-20260926/screenshots/`：桌面/移动各含 VIP 拦截弹窗与学校筛选保存回读。已人工查看桌面弹窗和移动已选状态，未见布局变化；截图不是全部像素相同的承诺。完整断言及合成数据结果保存在 Playwright JSON/HTML 报告。

- 本轮为内部重构，无视觉设计变更；实际覆盖隔离 Chromium 和移动尺寸 WebKit，未新增 IAB 视觉验收，也未核验真实 Safari/iOS 设备。
- 全量 Web lint 的 5 条旧警告位于 MSW 生成文件、邀请落地页及商户兑换页。Vite 配置和 pg 并发查询还有原有弃用提示，未作为本轮拆分顺带修改。
- 不带路径的设计系统 audit 会扫描 Git 忽略的 `artifacts/` 与 `campusdate/`，产生 936 项无关结果；限定 `apps/web/src` 的实际源码审计通过，未删工件或修改审计规则来隐藏结果。
- 管理员、匹配周期等其他大类未在这轮同时拆分；外部协议、持久化数据和恢复路径的兼容义务继续保留。
- 所有改动仍在本地清理分支，未 commit / push / deploy，未运行远端 CI。

## PR 阶段补充

PR #134 首轮 Browser E2E 在浏览器启动前的独立类型检查失败：新增用例引用 `@lilink/shared`，而干净安装尚无该包构建产物。用例已改为直接断言公开字段及 URL hash 契约，移除这项不必要的构建依赖，未放宽断言或修改生产代码。

修正后 `npm run test:e2e:infra` 两项、`npx tsc -p e2e/tsconfig.json` 均通过；类型检查输入不含 shared 构建产物。四个边界场景在 Chromium / 移动 WebKit 重新运行 8 项全部通过，0 skipped / failed / flaky，证据为 `artifacts/e2e/dc316e7cfb73` 和 `artifacts/deep-cleanup-20260926/pr-boundaries-final.log`。首轮提交的 push / PR CI 均已通过；后续提交的远端工作流状态以 PR Checks 为准，未合并或部署生产。
