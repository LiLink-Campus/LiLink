---
kind: changelog
lang: zh
---

# 暂存文档门禁与分类导航修复

> 文档归属：[验收记录](README.md)。

## 设计与失败边界

本次针对未提交内容 review 中的提交快照错位与分类导航缺口。日常工作树检查继续允许未被忽略的新文件；pre-commit 以当前 Git 索引为唯一输入，检查暂存的 Markdown、策略与目标文件集合。源索引先复制，固定树与物化副本只使用任务自己的索引；不隐藏或恢复真实工作树，也不修改真实暂存区。冲突索引、不完整策略或越界符号链接明确失败，任务副本在结束时回收。

实现前固定以下外部行为验收：

- 暂存坏文档、仅修好工作树，提交必须拒绝；链接目标未暂存也必须拒绝。
- 暂存文档正确但工作树后来改坏，提交应允许；完整正确快照应允许。
- 链接目标已暂存删除、工作树恢复文件，提交仍须拒绝；冲突索引不能获得通过结果。
- 中文与空格路径不误判；使用替代索引时检查该索引，并保持原索引与工作树。
- 读取暂存策略，不能被未暂存策略放宽；策略缺失或指向副本外部时不能退回默认范围。
- 分类入口必须直接列出直属文档与子分类索引；子页必须回溯直属父索引，不能依赖其他分类绕路。

Git hook 验收沿用真实 pre-commit 的 lint 与文档两个入口，以合成仓库执行，保存退出码、可见诊断、索引与工作树证据；不创建 commit。导航验收使用 Seiso 真实索引与明确的读者点击路径。

## 执行结果

暂存检查由 `scripts/docs/staged-snapshot.mjs` 生成有界原始对象副本，`check.mjs` 复用稳定规则与公开目标审计，pre-commit 改用 `docs:check:staged`，工作树与 pre-push 入口继续使用原语义。四份分类 README 补齐秋季子索引及直属回溯；`docs:verify` 通过 navigation.mjs 逐项检查直接导航，不仅检查全图可达。本机 hook 已重新安装并审计一致。

### 环境与重跑

本机 macOS，Node v24.20.0、npm 11.19.0、Git 2.55.0、Seiso 0.3.0。需要完整 checkout、现有 HEAD 与安装的锁定依赖；hook 场景全部使用合成数据和一次性仓库，无业务数据库、真实账户或应用服务。

仓库内持久验收命令：

```sh
npm run docs:hooks:verify
npm run docs:check
npm run docs:verify
npm run hooks:audit
npm run test:hooks
```

当前全部公开修改的快照另以临时 alternate index 验证，不暂存到真实索引。独立审查的故障注入与读者路径脚本仅保留在本机忽略工件目录；复现需要这些脚本仍存在：

```sh
node artifacts/staged-docs-navigation/verify-current-snapshot.mjs
node artifacts/deep-review-20261001/verify-staged-snapshot-extra.mjs
node artifacts/docs-navigation-review/behavior.mjs fixed
```

### 断言与工件

| 验收 | 结果 | 本机证据 |
| --- | --- | --- |
| 真实 hook 与 staged 命令 | 初始 10 场景基线 4 通过、6 失败；修复后扩展为 17/17 通过。允许与拒绝、明确诊断、条目/字节保真均按外部行为断言 | artifacts/docs-hooks-verification-baseline/report.json；artifacts/docs-hooks-verification/report.json 与逐场景日志 |
| 分类读者路径 | 修复前 48 条断言中恰好 4 条缺边；修复后 48/48 通过 | artifacts/docs-navigation-review/baseline-report.json；fixed-report.json；audit-report.json |
| 全范围文档维护 | 稳定规则与预览诊断为 0，公开目标和直接父子导航通过；完整索引与策略另存 | artifacts/docs-verification/report.json、navigation.json、index.json、policy.json |
| 当前公开交付快照 | 临时替代索引的完整快照通过，真实索引与被检查索引字节均不变；没有新 commit | artifacts/staged-docs-navigation/current-snapshot.json |
| 独立故障与仓库形态复核 | 16/16 通过，含 split index、linked worktree、相对/绝对替代索引、策略与 symlink、raw blob、并发变化和清理 | artifacts/deep-review-20261001/staged-snapshot-extra.json |
| 既有 hook 检查 | 13/13 通过，本机四项配置 audit 一致 | npm run test:hooks、npm run hooks:audit 实际输出 |

并发与 SIGTERM 注入使用 1 秒有界模拟 scanner 同步故障；其余策略/范围与用户路径使用锁定的真实 Seiso。临时仓库、索引和副本已回收，原有未提交内容及真实暂存区保留。

### 验证范围

本次未 commit、push 或部署，远端 CI 未触发。没有执行 Linux 全新安装、SIGKILL 清理、128 MiB/30 秒限制触发或真实 git commit；合成验证实际执行两个 Git pre-commit hooks，并验证提交所使用的索引内容。业务应用与原型源码没有改动，因此不重复其浏览器套件或生产构建。
