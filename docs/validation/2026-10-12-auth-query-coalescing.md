---
kind: changelog
lang: zh
---

# 普通用户在途身份查询合并验收

> 文档归属：[验收记录](README.md)。

## 范围与前提

实现[在途身份查询合并决策](../decisions/2026-10-12-auth-query-coalescing.md)，恢复同用户、同版本的进行中身份读取共享。仅 API Guard 有生产实现变动，没有迁移、DNS、数据库调度、登录密码验证或管理员 Guard 变更。用户接受的重置后旧状态共享窗口进入现行[账户契约](../reference/account.md#普通用户会话撤销)。

本机环境：macOS arm64、Node 24.20.0、npm 11.19.0、Docker 29.5.2、PostgreSQL 17、Mailpit。runner 自动创建 disposable loopback 服务、临时密钥和合成账号并在退出时清理。身份 SQL 观测只计数，不记录 SQL 参数、密码、Cookie、邮箱或完整响应；认证浏览器用例关闭 trace/video/screenshot。

## 命令与结果

```sh
npm run typecheck:api
npm run test --workspace api -- --runInBand common/auth/jwt-auth.guard.spec.ts modules/auth/auth.service.spec.ts
npm run lint:api
node scripts/e2e/run.mjs --api auth-query-coalescing.e2e-spec.ts auth-session-version.e2e-spec.ts
node scripts/e2e/run.mjs auth.spec.ts --project=chromium --project=mobile-webkit
npm run docs:check
npm run docs:verify
```

| 验收 | 实际结果 |
| --- | --- |
| 实现前行为验证 | 11 项中 3 项按预期失败：5 次交叠身份调用未合并、查询失败未共享、重置后旧请求立即返回 401 而非允许共享 |
| 实现后 HTTP + PostgreSQL | 2 个 suite、11/11 通过；会话断言 8/8、合并断言 3/3 |
| 真实查询合并 | 5 个交叠 HTTP 请求执行 1 次身份读取与 1 次身份 SELECT；结束后的正常读取和停用后拒绝各再执行 1 次 SELECT |
| 失败与账号隔离 | 3 个等待者共享本次失败，下一请求重新读库成功；其他账号在首账号暂停时独立返回自己的身份 |
| 密码重置窗口 | 未结束的旧版本读取可被重置后的旧请求共享；新版本读取在旧查询解除之前成功；旧查询结束后旧 Cookie 的新读写均 401 |
| 浏览器认证路径 | Chromium 6 项、mobile WebKit 1 项，共 7/7；登录、退出、私有导航、注册、重置旧会话/新会话可用与读取重试通过对应项目用例 |
| API 类型、现有 Jest 与 lint | 类型检查通过；现有 Jest 30/30；lint 通过 |

mobile WebKit 的项目标签只选择登录/退出/私有导航用例，不宣称它执行了 Chromium 的全部六项。没有用户可见前端修改；未使用个人浏览器或真实生产账号。

删除一项要求“每请求独立身份查询”的过时 mock 单元测试，其旧契约已被上述真实 HTTP/SQL 合并、结束后新状态和会话边界覆盖。没有补写单元测试。

文档稳定检查与链接/分类/历史来源验证通过。preview 有一条既有 EVD001，位于 2026-10-03 公开性能记录第 108 行的实验判定段；段落已有量化容差及相邻来源，人工检查未涉及本次改动，不新增豁免或改写旧记录。

## 工件与复现边界

本机忽略目录：

- 实现前：`artifacts/e2e/647e5a7c2c13/api-results.json`。
- 实现后（含共享窗口内旧会话写入）：`artifacts/e2e/8fb8463ac5ce/api-results.json`、`auth-coalescing-assertions.json`、`session-version-assertions.json`、`run.json`。
- 浏览器：`artifacts/e2e/b09d47370586/results.json`、`run.json` 和脱敏用例附件。
- 文档：`artifacts/docs-verification/report.json` 和 `preview.json`。

本地 runner 的 sourceSha 为基准 52937e17，sourceDirty=true，证明候选工作树而非该旧提交的行为；工件注明环境、命令、结果和运行 ID。GitHub CI 按 PR 精确提交单独核对，不把本机结果描述为 CI 或已部署生产。

本次验证没有量化生产页面耗时、冷启动、账单变化或全国线路性能；恢复查询共享不保证解决空闲首次登录慢。
