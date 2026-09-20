# 2026-09-20 发布前依赖安全复核

本轮对秋季版本执行 `npm audit` 和 `npm audit --omit=dev`，核查上游公告及实际调用路径，并更新锁文件。没有使用 `npm audit fix --force` 降级 Prisma 或升级 NestJS 主版本。

## 已修复依赖

| 依赖 | 发布候选版本 | 说明 |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.3.5 | 包含图片优化等安全修复，保持版本一致 |
| sharp | 0.35.4 | 与 Next.js 共用已修复的图片处理依赖 |
| Nodemailer | 9.1.1 | 包含邮件解析、资源访问和 TLS 验证修复 |
| NestJS common/core/platform-express/testing | 11.2.5 | 保持同版本；限定 multer 为 2.4.0 |
| Prisma / client / adapter-pg | 7.10.0 | CLI、客户端与 PostgreSQL adapter 保持一致 |
| Vitest / browser-playwright | 4.1.11 | 修复测试浏览器接口的安全问题，保持 peer 版本一致 |
| PostCSS / Hono node adapter | 8.5.28 / 1.19.17 | 更新已有 override |

锁文件同时更新可兼容的受影响间接依赖。新增 override 限定 NestJS 的 multer、Prisma 的 mysql2 3.24.4 和 js-yaml 4.x 的 4.3.2；不将 js-yaml 3.x/5.x 强行替换为 4.x。

Nodemailer 9 的主要兼容变化为默认验证远程 HTTPS 内容的 TLS 证书。本项目使用 SMTP 连接及服务端构造的正文，没有远程附件、OAuth2 token endpoint 或 HTTP 代理配置；没有关闭证书校验。

## 保留的上游告警

更新后完整审计为 **0 critical、3 high、0 moderate、0 low**。三个 high 标记来自同一个公告的依赖传播：`prisma → @prisma/config → deepmerge-ts@7.1.5`，不是三个独立漏洞。

[GHSA-ggr8-5vv4-36mx](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx) 要求向合并函数传入具有循环引用的 JavaScript 对象；普通 JSON 不满足该条件。本仓库的 `apps/api/prisma.config.ts` 是受控本地配置，仅传入 schema、迁移路径和数据库 URL 字符串，没有接收业务请求对象。运行时数据库客户端在 `apps/api/src/common/prisma/client.ts` 中直接使用 PostgreSQL adapter，业务代码不导入 deepmerge-ts。

因此当前应用没有发现可由远程请求触达的该漏洞路径，保留此告警，不将审计结果描述为零漏洞。Prisma 7.10.0 仍固定依赖 deepmerge-ts 7.1.5；deepmerge-ts 8 改变 Map 合并和原地修改语义，暂不强行跨主版本覆盖上游依赖。Prisma 升级或配置开始处理不可信对象时必须重新评估。

## 核验依据

- [Next.js 图片优化安全公告](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)
- [Nodemailer 9.0.0 兼容变化](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.0)、[9.1.1 修复](https://github.com/nodemailer/nodemailer/releases/tag/v9.1.1)
- [deepmerge-ts 8.0.0 兼容变化](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0)
- 本地审计与依赖树：`artifacts/release-review-20260920/dependency-audit-final.json`、`dependency-tree.log`。这些是 Git 忽略的本地证据，远端以锁文件和重新执行审计为准。

安全审计不替代浏览器、邮件、迁移、构建及 CI 验证；合并状态和最终回归结果见 PR #100。
