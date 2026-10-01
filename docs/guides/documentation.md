---
kind: howto
lang: zh
---

# 用 Seiso 维护项目文档

> 文档归属：[操作指南](README.md)。

## 新建与修改

1. 从 docs 总入口选择文档职责。维护现行行为前核对代码、配置、migration 与实际验证范围；需要历史事实时查询 Git，运行状态另附时间与环境证据。
2. 每项事实确定一个维护位置。其他页链接引用，长期页面不保存当天部署状态、测试数量或库存；这些观察进入注明日期的 records/validation。
3. 声明必要的 `kind`，目录映射已正确时可直接继承；少量例外用 frontmatter。需要指定中文时使用 `lang: zh`。每个分类 README 直接列出直属文档与子分类索引；子文档与子分类索引回溯直属父 README。
4. 移动或拆分时更新 Markdown 链接、标题锚点、命令与正文路径。历史代码引用固定到实际存在的 Git 提交，不将旧实现链接到语义已改变的当前文件。
5. 运行 `npm run docs:check`、`npm run docs:verify`，查看工件与 diff。预览规则用 `npm run docs:preview` 人工审阅；豁免必须有具体规则和可复核理由。

## 类型与位置

| 类型 | 维护位置 | 主要内容 |
| --- | --- | --- |
| readme | 各分类入口 | 定位、效力、导航、模板与命名 |
| howto | guides | 操作顺序、前提、预期结果 |
| runbook | guides 中的排障页 | 检查与恢复 |
| reference | reference | 当前定义、契约与来源 |
| adr | decisions | 原因、选择、权衡与覆盖关系 |
| plan | plans / templates | 尚待实施、评审或确认的工作 |
| changelog | records / validation / archive | 有日期的历史事实与验证范围 |

版本由 package.json 与锁文件固定。当前使用的 CLI 不接受 `kind: agents`，AGENTS 按现有 howto 映射检查；执行规则的权威仍是对应 AGENTS 文件。配置中的 generated 类型只用于真实生成器管理的内容，不用来规避历史问题。

## 检查与例外

稳定规则作为本机和 CI 门禁，preview 结果是审阅线索，不自动解释为事实过时。Seiso 检查不代替业务准确性核验；`--fix` 仅应用工具已证明安全的修改，不能自动完成语义重写。

`docs:check` 检查工作树的 Seiso 稳定规则，链接目标可属于 Git 跟踪文件或未被忽略的新文件；本机私有资料存在也不能使公开链接通过。历史本地工件使用注明效力的普通路径文本，公开索引不提供私有资料链接。`docs:verify` 复用公开目标校验，并检查直接分类导航、父页面回溯、职责、命令、历史来源与原型哈希。全图可达检查继续保留，但不能代替分类入口的直接路径。

pre-commit 的[注册入口](../../scripts/hooks/registry.mjs)执行 `docs:check:staged`，以提交所用索引的固定快照检查文档、`seiso.toml`、忽略规则和链接目标，未暂存文件与工作树的后续修补不会进入该快照。源索引先复制，再从 Git 原始对象创建临时副本，不使用工作树转换过滤器，也不修改源索引或工作树；结束时核对源索引没有变化。冲突、暂存策略缺失、空检查范围及越界符号链接均拒绝提交。首次接入时须将策略与相关文档一起暂存，不能只在工作树修好错误后提交旧快照。

pre-push 继续执行工作树 `docs:check`；GitHub push、pull_request 和手动 Documentation workflow 执行 `docs:verify`，验证远端 checkout。真实提交门禁的合成行为验收使用 `npm run docs:hooks:verify`，需要完整 Git checkout、锁定依赖及 Git 2.54+，会自动清理合成仓库且不创建 commit。

`npm run docs:tooling:verify` 在合成 checkout 中调用真实检查 CLI，验证工作树链接拒绝指向私有或越界文件的符号链接，包括带锚点的私有目标，并接受公开目标；迁移 manifest 拒绝目标与清单同时改写、空文件集和经符号目录越界的目标；Seiso 配置异常时覆盖旧成功报告并保存终态失败结果。该验收只使用合成文件与现有 Git 对象，不连接数据库、不启动应用服务或创建 commit；Documentation workflow 同时执行它。

历史与现行内容分别处于比较域，历史断链继续检查。私有原件、第三方 vendored 说明和原型内部来源文件的范围由 seiso.toml 声明；范围变化与正文一起审阅，不能通过空文件集获得通过结果。

## 验收工件

`docs:verify` 生成 Git 忽略的 `artifacts/docs-verification/`：有效策略、目录索引、稳定/预览诊断、导航与职责断言、npm 脚本存在性核对、Git 历史目标和原型哈希。运行环境使用锁定 Node/npm 与本地 Seiso，前提为完整 checkout 和已安装依赖。

暂存门禁报告位于 `artifacts/docs-check-staged/report.json`，记录快照树、范围与结果；行为验收报告与逐场景日志位于 `artifacts/docs-hooks-verification/`。暂存物化最多读取 128 MiB 原始对象，Git 子进程和 Seiso 检查均有时限；超限或不完整结果会失败。正常结束、错误及 SIGINT/SIGTERM/SIGHUP 会回收任务副本；SIGKILL 或断电不能保证清理，残留副本位于系统临时目录的 `lilink-staged-docs-*`，仅在确认任务归属后处理。

检查工具的八个合成场景、运行环境、数据前提、逐项断言与脱敏日志保存在 `artifacts/docs-tooling-verification/`；报告声明实际执行结果，失败不会复用上次成功。

原型迁移额外运行 `docs:prototype:verify`，由命令管理隔离副本、随机 loopback 服务和回收，保存真实页面断言、服务端 fetch 守卫记录及 Chromium/WebKit 截图。无需启动业务 API 或已有原型服务。源素材迁移哈希与逐篇去向保留在此次重整记录中；公开工件不包含私有原件内容、配置、会话或真实用户数据。

`prototypes/migration-sha256.json` 固定历史来源与当前目标文件。必要适配先记录原因与验收，保留 sourceSha256/sourceBytes 和原始 Git 来源，再更新目标哈希；检查同时验证原稿与适配结果。新探索另建有来源日期的副本，避免改写旧设计证据。

Git pre-commit/pre-push 通过项目 hook registry 检查文档；提交后的远端 CI 结果仍须按精确提交报告。
