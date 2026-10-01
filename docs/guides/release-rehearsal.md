---
kind: howto
lang: zh
---

# 隔离环境发布演练

> 文档归属：[操作指南](README.md)。

默认用户路径通过 [浏览器 E2E](browser-e2e.md) 的 disposable loopback 环境验证。需要生产镜像、完整匹配与送信、迁移恢复或容量证据时，使用 `scripts/release/` 的专项工具；隔离数据库、账号、目标身份与执行范围必须先核验，旧记录不代表资源仍可使用。

## 选择与准备

1. 阅读 [targets.mjs](../../scripts/release/targets.mjs) 和 [演练运行器](../../scripts/release/local-rehearsal.mjs) 的实际限制。它们固定允许的合成项目、分支、数据库与 role，拒绝生产目标；新增目标须经独立身份核验和专项变更。
2. 将连接、加密备份与目标 manifest 放入受控且 Git 忽略的本地目录，按工具要求设置绝对路径。库、镜像、API 和 Web 的候选身份应与独立审核的预期一致，不能从实际响应复制出“预期”。
3. 准备 Docker、Mailpit 和校验过的 Caddy；版本、资源限额与目标要求查询运行器。记录宿主/容器架构、数据库资源、正常 jobs 开关和连接池设置，避免把模拟配置当成生产容量。

该运行器保留专项演练的固定目录与目标，不接受任意数据库。`start` 要求设置 `RELEASE_CADDY_BINARY` 为 Caddy 2.11.4 的可执行路径；`RELEASE_TARGET_FILE` 与 `RELEASE_DATABASE_FILE` 可指定目标 manifest 和连接文件，默认位于 Git 忽略的 `artifacts/questionnaire-release-20260920/`。同一固定目录还必须提供受控的 `load-access-key` 和 `tunnel-token` 文件，覆盖前两个路径不会改变这两个文件的位置。候选 API/shared/release 源码、Docker 忽略规则及依赖声明必须已提交，运行器会拒绝其未提交变更。目标资源与身份未重新核验时，不执行此专项流程，使用默认浏览器 E2E 环境。

## 运行与判定

从仓库根目录、按已审核的配置运行：

```sh
node scripts/release/local-rehearsal.mjs start
node scripts/release/local-rehearsal.mjs matching
node scripts/release/local-rehearsal.mjs evidence
node scripts/release/local-rehearsal.mjs stop
```

匹配阶段必须核对候选、终态、快照、引荐和 Mailpit 收件；重试不能重复揭晓或重复送信。恢复演练由 [database.mjs](../../scripts/release/database.mjs) 管理，写入前核验目标和恢复范围。

容量工具区分单个 API 请求、完整 API 页面入口和 SSR HTML；断言及计数口径查询 [load.js](../../scripts/release/load.js) 与 [load-ssr.js](../../scripts/release/load-ssr.js)。完整浏览器显示仍需另做用户路径验收。接入新的远端负载目标或真实数据不由本指南授权。

结果保留运行命令、环境/数据前提、候选 SHA、行为断言和脱敏证据。清理仅回收本次任务拥有的进程、容器和网络，保留诊断工件；失败后按运行器记录确认资源归属再回收。

[GitHub 演练](../../.github/workflows/release-rehearsal.yml) 使用手动触发。旧工具说明与具体时点观察保留在 [实施记录](../records/README.md)，生产发布另按 [发布与回滚](production-release.md)。
