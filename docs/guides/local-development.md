---
kind: howto
lang: zh
---

# 本地开发

> 文档归属：[操作指南](README.md)。

使用仓库 [.node-version](../../.node-version) 与 [package.json](../../package.json) 声明的 Node/npm 工具链。Git config-based hooks 需要 Git 2.54+；启动 Docker 后执行以下步骤。命令从仓库根目录运行。

1. `npm ci` 安装锁定依赖。
2. `npm run hooks:install` 安装 hooks，`npm run hooks:audit` 检查安装结果。
3. 若 `apps/api/.env` 不存在，按 [API 配置模板](../../apps/api/.env.example) 创建本地配置；保留已有配置，使用开发库和合成数据。将 `JWT_SECRET`、`ADMIN_JWT_SECRET`、`MERCHANT_JWT_SECRET`、`CRON_SECRET`、`REDEEM_TICKET_SECRET` 的占位值替换为独立的本地随机值。
4. `npm run infra:local:mail` 启动本地 PostgreSQL 与 Mailpit。
5. 核对本地数据库目标后执行 `npm run db:migrate`、`npm run db:seed-defaults`。
6. 需要本地管理员时在 `apps/api` 下运行 `node scripts/bootstrap-admin.mjs`，按脚本要求设置本地 bootstrap 值。
7. `npm run dev` 先构建 shared，再启动 shared watcher、Web 与 API。

Web 使用本地 3000 端口，API 使用 4000；Mailpit SMTP 映射到本机 2525，收件界面使用 8025。基础服务完整声明位于 [本地 Compose](../../docker-compose.local.yml)。`npm run infra:local:down` 停止这套基础服务。

Web 的开发默认 API 为 `http://localhost:4000/v1`；工作区 build/typecheck 脚本缺省也补入这个本地地址。需要覆盖地址或监控设置时，按 [Web 配置模板](../../apps/web/.env.example) 在 `apps/web/.env.local` 填写本地配置；生产部署须明确设置目标 `NEXT_PUBLIC_API_BASE_URL`。环境文件不入库，已有根目录配置也须核对数据库目标。仅填写 `ADMIN_BOOTSTRAP_*` 不会创建管理员，须完成第 6 步后登录 `/admin`。

## 按范围执行

| 任务 | 命令或入口 |
| --- | --- |
| 单独启动 Web/API | `npm run dev:web`、`npm run dev:api` |
| 构建工作区 | `npm run build`，脚本负责 shared 的先后顺序 |
| 修改 Prisma schema 或客户端依赖 | `npm run db:generate` |
| 类型检查 | `npm run typecheck:web`、`npm run typecheck:api` |
| 检查文档 | `npm run docs:check`、`npm run docs:verify` |
| 验证用户路径 | [浏览器 E2E](browser-e2e.md) |
| 核对 UI 状态 | [视觉验收](visual-verification.md) |

完整脚本由 [package.json](../../package.json) 维护。`npm run lint:api` 包含自动修复，执行后检查 diff。测试环境、合成数据与产物规则按 E2E 指南执行。

完整 demo seed `npm run db:seed` 需要本地 `SEED_TEST_PASSWORD`；仅 seed defaults 不创建 demo 用户。失败的 shared 构建应先修复，再启动依赖它的应用。

本地拓扑与部署配置边界见 [系统参考入口](../reference/README.md)，生产操作见 [生产发布](production-release.md)。
