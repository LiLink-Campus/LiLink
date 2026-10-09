---
kind: howto
lang: zh
---

# 隔离生产镜像负载演练

> 文档归属：[操作指南](README.md)。

在仓库根目录执行 `node scripts/release/local-rehearsal.mjs`。需要 Node 24、Docker 和镜像下载权限；不需要线上 Secrets 或远端数据库。GitHub 的 [手动演练](../../.github/workflows/release-rehearsal.yml) 执行同一命令，不参与 PR 回归门禁。

构建前必须提交会影响 API 镜像或演练脚本的改动：检查 `.dockerignore`、根 package/lock、`apps/api`、`packages/shared`、`scripts/release` 和源码身份工具的 staged、unstaged、untracked 状态，不干净时在调用 Docker 前失败。镜像上下文、挂载的演练脚本和问卷 Fixture 都来自已检查 SHA 的 Git archive，不包含忽略的本地产物，也不会混入构建期间新增的修改；镜像标签和 `run.json` 使用该 SHA。无关 Web 或文档编辑不会阻止 API 演练。任务源码快照与临时凭据一起清理。

运行器构建 [生产 Dockerfile](../../apps/api/Dockerfile.prod)，新建带随机任务标签的内部网络、临时 PostgreSQL 和 Mailpit。数据库 URL 必须属于当次 run-id，迁移前检查容器标签、实际数据库名、role 和空 schema。生产入口正常执行 migration 和应用启动，临时 Secret 文件单独只读挂载，运行 UID 1001 可读。没有宿主端口、公网域名、Tunnel、Caddy 或远程控制接口。

初始化 2000 个合成用户、学校、问卷和三轮历史配对后，真实执行 prepare、reveal、用户快照、outbox 和 Mailpit 验证。检查参与者集合、配对唯一性、无自配、历史配对限制、快照对应和通知去重。重复 tick 不得重新揭晓。撮合耗时与通知排空时间分别记录；2000 人是数据规模，不代表 HTTP 并发用户数。该单点负载不能外推生产容量，硬约束和事务边界的全面回归仍由固定测试集合承担。

API 容器限制为 2 CPU、3584 MiB、数据库连接上限 20，正常后台任务开启。演练显式使用既有 `OUTBOUND_EMAIL_FLUSH_BATCH_SIZE=500` 配置，以覆盖实际批量通知；这不是默认批量 50 的送达耗时保证，也不修改生产配置。合成用户要求双向异性匹配，快照中的身份、介绍及联系方式必须与实际配对一致。

需要业务 HTTP 压测时运行 `node scripts/release/local-rehearsal.mjs --api-load`。它在同一任务内部网络使用 k6 执行鉴权读取、资料保存和报名写入，保留业务结果、延迟、错误率及丢失迭代检查。默认 33 次业务迭代/秒、120 秒；结果在 `k6.json`，与撮合耗时分别解释。没有用 `/health` 延迟代表业务吞吐。

资源采样仅包围实际撮合、揭晓、通知及可选 k6，保存 Docker CPU/内存和 PostgreSQL 连接状态；没有 pg 原型方法包装。失去的独有观测为客户端连接 checkout/query 延迟及 event-loop 分位数，必要诊断可按事故另行采集。负载完成后立即清理；通知仍有十分钟业务期限，不以提前退出加速。

每轮 `artifacts/release-output/<run-id>/` 保存构建和运行日志、业务断言、资源采样、耗时及清理结果。临时凭据不进入工件，结束/错误/取消都回收当次容器、网络和凭据。`--fail-after-start` 用于验证生产启动后的失败清理，预期命令非零退出。SIGKILL 或宿主断电时按工件 run-id 查找 `lilink.rehearsal=<run-id>` 标签，只清理确认归属的资源，不执行全局 prune。

旧公网 SSR、跨网关压力、压缩代理和长期空转监测已退役；本流程不证明这些能力。既有 [数据库运维工具](../../scripts/release/database.mjs) 与 [目标保护](../../scripts/release/targets.mjs) 保留独立远端隔离库边界，不在演练中自动使用。生产操作另按 [发布与回滚](production-release.md)，本指南不授权生产写入。
