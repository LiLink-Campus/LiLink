---
kind: runbook
lang: zh
---

# 值守与故障排查

> 文档归属：[操作指南](README.md)。

## 检查主链路

1. 确认目标环境与时间窗口，记录用户症状、API/Web SHA 和错误范围，保留脱敏请求关联信息。
2. Web 无法打开时检查 deployment、路由与域名；API 失败时检查进程、Compose、反向代理与 `health`。
3. `health` 正常而业务失败时检查 `landing`、数据库与 migrations，再定位用户接口的认证、授权和请求日志。
4. Web 服务端与浏览器表现不一致时核对 [API 路由](../reference/server-api-routing.md) 和 [公开缓存](../reference/public-data-cache.md)，区分源站、边缘路径与缓存。
5. 邮件失败时检查 outbox、SMTP 配置和送达证据。SMTP accepted 不能单独证明真实收件。
6. 轮次失败时检查状态、截止/揭晓边界与后台预演，按 [匹配参考](../reference/matching.md) 核对资格和数据时点。

## 恢复与记录

按 [生产发布与回滚](production-release.md) 选择已授权的恢复操作。数据库写入、服务重启与切流分别评估影响；保留前后状态和单写边界。

关闭故障前验证受影响的用户行为已经恢复，记录触发条件、影响、诊断依据、恢复操作和后续任务；私有日志与真实数据保留在受控位置。
