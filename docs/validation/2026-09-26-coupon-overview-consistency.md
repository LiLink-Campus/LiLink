# 优惠券概览并发一致性验收（2026-09-26）

## 目标与修复

`getMyCouponOverview` 原先并发执行两个独立 SELECT。核销在两个查询之间提交时，可用区和历史区可能重复或遗漏同一券。现将两次读取放入 `RepeatableRead` 事务，共享数据库快照及同一 `now`；活动补发仍在事务外，单独翻页的实时资格与分页边界保持不变。`readCouponPage` 只依赖事务客户端的 `coupon` delegate。无 schema、依赖或迁移变更。

## 先行行为测试与重现

实现前新增 `apps/api/test/coupon-overview-concurrency.e2e-spec.ts`。真实 PostgreSQL 读取通过 Prisma query extension 设置栅栏，第一分区读完后，独立客户端在事务内提交券状态和核销记录，再放行第二分区。3 秒超时仅用于诊断卡住的栅栏，不以 sleep 决定交错。测试同时断言实际执行顺序。

- 可用区先读取：修复前同一券出现 2 次，预期 1 次，失败。
- 历史区先读取：修复前同一券出现 0 次，预期 1 次，失败。
- 修复后，两种交错均恰好返回 1 张可用券、空历史区；随后新请求仅在历史区返回该券，状态 `REDEEMED` 且有核销时间。

复现命令（仓库根目录）：

```sh
node scripts/e2e/run.mjs --api coupon-overview-concurrency
```

环境：macOS arm64、Node v24.20.0、npm 11.19.0、Docker 29.5.2、PostgreSQL 17 Alpine、Mailpit v1.20。依赖须已安装且 Docker 可用。runner 复制排除 `.env*` 的隔离工作区，在随机非 5432 loopback 端口创建 `lilink_vip_test_<runId>` 数据库（API 模式现行命名），应用 47 个迁移，构建 shared/API 后执行测试。所有数据为合成记录；结束后删除该次数据库/Mailpit 容器和临时工作区，保留日志。没有访问开发或生产数据库。

工件目录相对仓库根目录，包含 `run.json`、`tests.log`、`build.log`、`migrate.log` 和 `cleanup.log`：

| 阶段 | 工件目录 | 结果 |
| --- | --- | --- |
| 修复前 red | `artifacts/e2e/8e1b4aacb286/` | 2 failed；exitCode 1；重复 2 / 遗漏 0 |
| 首次 green | `artifacts/e2e/5da5cb38aacb/` | 2 passed；exitCode 0 |
| lint 修正后 green | `artifacts/e2e/d79e6d7835ea/` | 2 passed；exitCode 0 |
| 最终源码 green | `artifacts/e2e/6fa1c9935f15/` | 2 passed；exitCode 0 |

最终重跑移除了偶然 runner 字段 `E2E_OUTPUT` 的要求，以兼容现有 CI 的 `lilink_vip_test_ci` 数据库；仍强制 loopback、显式非 5432 端口和专用库名前缀。行为契约未改变。上述工件为本机验收输出，不加入 Git。

## 检查与边界

- `npm run typecheck:api`：通过，日志 `artifacts/validation/coupon-overview/typecheck.log`。
- `npm run test --workspace api -- --runInBand modules/coupon`：2 suites / 24 tests 通过，复用既有测试，未补写单元测试。日志 `artifacts/validation/coupon-overview/jest.log`。
- `cd apps/api && npx eslint src/modules/coupon/coupon.service.ts src/modules/coupon/coupon-reader.ts test/coupon-overview-concurrency.e2e-spec.ts`：通过。首次与 Prisma generate 重叠造成临时类型解析错误；生成结束后重跑，修正一处 matcher 的 unsafe assignment 后通过。最终日志 `artifacts/validation/coupon-overview/lint.log`（无诊断，exitCode 0）。
- `git diff --check`：通过。源文件和测试均小于 500 行。
- shared/API 构建和数据库迁移：隔离 runner 通过，见最终 green 的日志。

本次验收为服务入口与真实 PostgreSQL 的并发行为验收，不包含 HTTP 身份验证、商户核销 UI 或浏览器页面。账号隔离与分页已有浏览器覆盖（`e2e/specs/private-read-auth.spec.ts`、`e2e/specs/performance-contracts.spec.ts`），本次未重复新增或代跑；由主执行者负责发布前所需的整体验收。未 commit、push 或 deploy；远端 CI 与生产验证不属于本记录的已完成范围。
