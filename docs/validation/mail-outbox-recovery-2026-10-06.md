---
kind: changelog
lang: zh
---

# 邮件 outbox 跨窗恢复验收

> 文档归属：[验收记录](README.md)。

关联：[GitHub issue #140](https://github.com/LiLink-Campus/LiLink/issues/140)。现行契约由[邮件投递](../reference/mail-delivery.md)维护。

## 设计与外部契约

业务事务继续持久化 outbox，SMTP 始终在事务外。活动窗口外的独立兜底截止点不随内联触发延期；扫描失败使用封顶退避。扫描与批次保持现有互斥边界，等待发送槽位有截止且会移除排队项；数据库与 SMTP 操作分别有硬截止。数据库客户端只用于邮件投递，连接获取和连接租用均有硬截止；截止会销毁连接，而不是只丢弃 Promise。SMTP 截止关闭当前连接池，避免在途资源无限占用发送槽位。

投递槽位取得后读取当前记录。领取事务校验验证码存在、未消费、未替换和未过期；匹配邮件复用现有 Match 锁和撤销检查。CAS 同时校验持久化预算及本次 attempts；终态不能恢复。完成写回需匹配状态、领取时间和 attempts，验证码状态同步也检查资格。

默认预算：F（空闲扫描）15 分钟，允许 1–60 分钟；B（退避上限）5 分钟，允许 1–15 分钟；C（cron tick）60 秒；Q（DB 操作硬截止）10 秒，允许 1–30 秒；SMTP 硬截止 30 秒，允许 1–120 秒。发送槽位等待 A 默认 30 秒，允许 1–120 秒。W 是已有扫描与批次释放执行权的最长时间，最多 `5Q + A + SMTP截止 = 110秒`；因此保守 `T_scan <= max(F, B) + C + W + Q = 1080秒`。正常活动扫描每分钟，空闲空队列每 F 至多一次候选查询，指标复用候选结果，不另发每 tick 查询。

有限积压 N、批量 L、并发 P 与健康 SMTP 的交付预算独立计算。验收 N=6、L=2、P=1，无故障后 SMTP 重试；发送槽位等待到期的记录由后续扫描继续处理，因此按每次扫描至少完成一封计算保守上界：`T_delivery = T_scan + N * (C + Q + A + 4Q + SMTP截止)`。验收配置下 T_scan=191秒、T_delivery=611秒，不承诺无限积压公平性或 SMTP exactly-once。

## 实现前失败方式与覆盖矩阵

| 失败/边界 | 验收路径 | 外部断言 |
| --- | --- | --- |
| 数据库故障跨实际窗口，无新流量 | 一次性 PostgreSQL TCP 黑洞，API 时间推进超过 30 分钟，恢复代理转发 | 独立兜底内扫描、真实 Mailpit 收件、全部有效邮件 SENT |
| PENDING / 到期 FAILED / stale PROCESSING，超过一批 | 六封合成无 TTL 邮件、批量二 | 三类都送达，预算不突破 |
| 最后预算领取后写回失败 | 真实 SMTP 收件，分别使成功与失败写回遇到数据库网络黑洞；另有 stale 预算用尽 | 恢复后 EXHAUSTED，无新增收件 |
| 过期/消费/替换/缺失验证码 | 真实 EmailCode 与 outbox | 无收件、终态、expiresAt/consumedAt 保持 |
| 等槽位期间验证码失效 | 阻塞 SMTP 或 held gate 后消费验证码 | 取得槽位后禁止发送 |
| 等数据库锁期间验证码过期 | PostgreSQL held EmailCode 行锁，API 时间跨 expiresAt | 实际领取前拒绝，无收件，TTL 保持 |
| 匹配撤销及在途写回 | 复用 mail-match-invalidation / mail-deactivation PostgreSQL E2E | 不发送撤销快照、不覆盖终态 |
| 多实例争抢与新租约 | 两个 MailService 使用同一 PostgreSQL | 单租约最多一次 SMTP、预算原子保护 |
| 多开关 | 修改隔离测试进程配置 | BACKGROUND 仅后台停；MAIL/maintenance 禁止发送 |
| 短故障、重复故障、退避封顶 | 同一 API 时间源推进和数据库网络黑洞 | 有界退避，恢复清零，无并行扫描风暴 |
| Q/W/SMTP 资源释放 | 已连接数据库 TCP 黑洞及 SMTP 黑洞 | 操作有界完成，pool/扫描/发送槽位可再次使用 |
| 空闲扫描及指标频率 | 空队列调用多个 tick | 兜底周期内无附加查询；积压失败后标 UNKNOWN |

隔离验收入口仅在 `apps/api/test`；无生产故障控制 HTTP 接口。运行入口：`node scripts/e2e/run.mjs --api mail-outbox-recovery.e2e-spec.ts --runInBand`。既有匹配行为：`node scripts/e2e/run.mjs --api mail-match-invalidation.e2e-spec.ts mail-deactivation.e2e-spec.ts --runInBand`。前提：Node 24、npm 11、Docker；runner 自建一次性 loopback PostgreSQL/Mailpit、合成数据与临时密钥。

工件写入 `artifacts/e2e/<run-id>/mail-outbox-recovery.json`，包含候选 SHA、源码是否有未提交改动、预算、时间线、断言、脱敏终态、Mailpit 收件数量；不包含正文、收件人或验证码。提交前源码验收：隔离故障 11/11 与既有匹配撤销及注销行为 18/18 均通过（运行 d3da77959b4f）；首次成功扫描为恢复后 API 时间 120秒，六封邮件全部投递为240秒。CI 使用其一次性 127.0.0.1:55432/lilink_vip_test_ci 及 Mailpit，同一测试文件内部的 TCP 故障代理隔离故障，不暂停共用服务。最终候选 SHA 以重新运行的工件为准。
