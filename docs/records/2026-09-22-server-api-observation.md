---
kind: changelog
lang: zh
---

# API 服务端连接排查观察

> 文档归属：[实施记录](README.md)。
> 来源：[原始记录](https://github.com/LiLink-Campus/LiLink/blob/f01ea8a211cfc2a95d7189c0fda545998e8b2b2c/docs/2026-09-22-server-api-routing.md)。

2026-09-22 的排查中，Cloudflare 路径的公开问卷请求测到约 3–11 秒；同时间源站本机约 60–70 毫秒。资料聚合请求在源站成功返回约 97 毫秒，前端仍触发超时。这证明慢请求不能仅归因于数据库查询，但不代表所有用户网络延迟均有相同原因。

这些数据仅代表该时间窗口，不证明今天的 DNS、部署配置或网络延迟。现行机制见 [参考入口](../reference/README.md)。
