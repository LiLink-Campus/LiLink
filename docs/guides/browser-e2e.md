---
kind: howto
lang: zh
---

# 固定自动化回归与浏览器 E2E

> 文档归属：[操作指南](README.md)。

## 完整运行

仓库锁定 Node 24、npm 11 与 Playwright 1.60.0，需要本地 Docker daemon。干净 checkout 后执行：

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:ci
```

`test:ci` 固定执行 `test:ci:core` 与 `test:ci:stories` 两个职责集合。主要 [CI Workflow](../../.github/workflows/ci.yml) 的两个原生 Job 使用相同定义；PR、main push 和手动运行不按路径或事件改变范围，没有每日 Full 或重试放行。框架禁止 only，空集合失败，必要回归不得 skip。任一命令非零、取消或超时都不能满足完整验收。

核心集合由 [Linux 包装器](../../scripts/e2e/linux.mjs) 在 Node 24.20.0 / Debian Bookworm / Playwright 1.60.0 中执行 [固定命令](../../scripts/test-ci.sh)。宿主不预先执行整套，容器不递归调用 `test:ci`。质量检查、Shared/API/Web 行为、工具与文档检查后，复用 Shared/API 构建运行真 PG 集成和浏览器。Storybook 使用 Vitest/Vite，执行有 `test` tag 的独立行为，不消费静态 Storybook。

Storybook 的非静态资源未匹配请求会在原生生命周期检查中使测试失败，即使组件捕获了请求异常。预期401、503或网络失败必须使用显式 MSW handler，并断言对应界面行为。开发展示文件未进入固定集合时，报告中的文件 skipped 不代表216个必要行为用例被跳过。

## 隔离与证据

[运行器](../../scripts/e2e/run.mjs) 生成随机 run-id、loopback 端口和业务密钥，只允许当次 PostgreSQL 测试命名空间。Prisma 在迁移前检查最终生效目标，测试环境不加载本地 `.env`，裸 API `test:e2e` 也委托隔离运行器。禁止连接开发、已有用户或生产数据库。

API 集成与浏览器使用同一临时 PostgreSQL/Mailpit 服务、不同数据库。第二次 migration 是避免全局轮次、问卷和破坏性测试污染的必要准备；历史升级使用独立旧 schema。浏览器只 seed 一次，真实 API 在 Web 生产构建前就绪，Next 的编译 origin 与实际服务一致。contract proxy 与 devlog fixture 在主实例固定启用；Sentry Replay SDK 的 iframe 原生计时器与浏览器 fake clock 有实测干扰，因此三条 SDK 接线使用独立 Web 编译和隔离数据库，仍由同一固定入口运行并复用 API dist。第三次 migration 是该独立环境准备；两次 Web build 明确承担不同编译条件。所有 fixture/collector 仅绑定 loopback，不是演练公网代理。

Chromium 执行固定主集合；`@mobile` 指定 mobile WebKit 的真实移动边界，`@webkit` 指定桌面 WebKit 的 details/像素差异。不再将全部场景乘以四项目。模拟引擎不代表已测试安装版 Safari 或真实 iOS。

Linux 工件位于 `artifacts/e2e-linux-results/<run-id>/`，内部 E2E 子目录包含原生 JSON/HTML 报告、失败证据、服务日志和 `run.json`。普通成功测试不批量截图；涉及凭据路径按隐私边界关闭敏感 trace。报告 selected/executed/skipped/retried，skip 不计通过。只使用合成账号和邮件，不上传环境文件。

`run.json` 记录启动时的 `sourceSha`、`sourceDirty` 和 `generatedDirty`，复制源码后再复核。`sourceDirty` 排除 [Sharp专属输出路径](../../scripts/images/generated-paths.mjs)，仍包含手写CSS、源图片、生成器与其他源码的 staged/unstaged/untracked 修改；`generatedDirty` 单独记录这些生成路径的Git差异。后者只是差异分类，不证明产物有效；固定构建仍校验生成输入、工具链及完整输出内容，缺失或篡改就重新生成。跨平台生成差异不再冒充手写源码变动。

本地允许未提交修改，但 `sourceDirty: true` 表示 SHA 只是工作区基点；复制期间观察到 HEAD 改变也标记为 sourceDirty。提交级证据仍需要复制期间保持源码干净、完整固定集合和对应的实际 Checks，不能单靠两个布尔值证明。单例调试使用 `--reuse-api-build` 时，调用者还必须保证已有 API dist 与当前源码一致。

正常结束、失败与 SIGINT/SIGTERM 删除当次进程、容器和临时源码；Linux 包装器保留工件。SIGKILL/断电后用 `docker ps -a --filter label=lilink.e2e=<run-id>` 核对归属，再清理该次残留，不执行全局 prune。

## 单例调试与视觉基准

```sh
node scripts/e2e/run.mjs auth.spec.ts --project=chromium
node scripts/e2e/run.mjs --api auth-session-version.e2e-spec.ts
npm run test:e2e:web:linux -- --grep @visual
```

单例是调试过滤，不代表完整 `test:ci`。开发静态预览可运行 `node scripts/e2e/run.mjs --serve --serve-minutes=30`，从 `session.json` 获取隔离 webUrl 用于 in-app browser；服务退出或到期自动清理。

像素基准保存在 `e2e/baselines/<platform>/<project>/`，普通运行只比较；必要更改使用 `--update-snapshots` 后人工检查 expected/actual/diff。不同 renderer 的图片不混用，不自动批准差异。交互和布局断言优先采用可观察终态，不用保存成功 PNG 冒充视觉回归。

## 时间边界

缓存调度器默认时间语义由边界行为验证；短周期集成保留真实 PostgreSQL、SQL 锁/取消、网络 deadline、租约排他和自动恢复。JavaScript 时间推进不代表 PostgreSQL `NOW()` 推进，数据库资格条件使用历史或近到期持久化时间戳。

取消的默认长墙钟保证包括 15 分钟多进程窗口对齐、连续超过五分钟真实静默、43 分钟退避全过程、长时间 timer 漂移与 Neon scale-to-zero/账单证明。短周期通过不等价于上述保证。必要核心状态转换仍固定常跑，不移到隐藏手动 Full。

## Required Checks

在线 Ruleset 仍要求 `API unit and e2e tests` 与 `Storybook smoke tests and screenshots`。本次将两个真实 Job 保留同名于 `ci.yml`，后者虽保留历史名称，实际执行精简 Story 行为且不截图。不会删除正在被规则引用的 context，也不修改管理员设置。

需要重命名时，先新增有实际执行责任的新 Job/context 并在 PR 验证通过与受控失败；管理员再以新 contexts 替换旧规则，确认同一 head 已有有效检查后删除旧名称。回滚先恢复旧有效 context，再恢复原规则，不制造无保护空窗。本 PR 不宣称在线重命名已完成。
