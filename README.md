# LiLink

**校园里的，认真相遇。**

LiLink 是面向高校学生的每周 1v1 匹配平台。用户完成资料与问卷，选择本轮参与意向，经过条件筛选和匹配计算后查看结果，再决定是否建立联系、安排见面并提交反馈。

本仓库包含用户网站、管理后台、商家核销入口及后端 API，使用 npm workspaces 统一管理。

## 主要功能

| 模块 | 当前能力 |
| --- | --- |
| 注册与账号 | 学校邮箱验证码注册；普通邮箱通过邀请码注册并手动选择学校；登录与密码重置 |
| 资料与问卷 | 个人资料、匹配偏好、问卷填写与版本管理 |
| 每周匹配 | 参与状态与交友／约会意向、条件筛选、配对计算、结果揭晓、联系意向与引荐邮件 |
| 见面与反馈 | 见面提议、时间地点协商、破冰流程、见面反馈及举报 |
| 邀请与商家 | 个人邀请、推广活动、优惠券发放、动态核销码及商家核销 |
| 管理后台 | 学校与用户管理、问卷修订、轮次预览与执行、举报处理、操作审计和数据分析 |

目前的匹配主流程是 **1v1**；首页的“多人局”仍为即将开放状态。

## 本地启动

### 环境要求

- **Node.js 24.20.0 LTS / npm 11.19.0**：版本声明见 [package.json](package.json)、[.node-version](.node-version) 和 [.nvmrc](.nvmrc)。
- **Git 2.54+**：用于项目的 Git config-based hooks。
- **Docker + Docker Compose**：本地运行 PostgreSQL 和 Mailpit；构建 API 镜像还需要 BuildKit／buildx。

使用 nvm 的开发者可在仓库根目录运行 `nvm install && nvm use`。以下命令均从仓库根目录执行，另有说明的除外。

### 1. 获取代码与安装依赖

```sh
git clone https://github.com/LiLink-Campus/LiLink.git
cd LiLink
npm ci
npm run hooks:install
npm run hooks:audit
```

`npm ci` 会自动生成 Prisma Client。若下载遇到连接重置，可重试 `npm ci --maxsockets=4 --fetch-retries=5`。

### 2. 配置本地环境

首次启动时复制 API 配置模板，已有配置不会被覆盖：

```sh
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
```

编辑 `apps/api/.env`：

- 本地数据库与 SMTP 地址可使用模板默认值，对应下面启动的 PostgreSQL 和 Mailpit。
- 将 `JWT_SECRET`、`ADMIN_JWT_SECRET`、`MERCHANT_JWT_SECRET`、`CRON_SECRET`、`REDEEM_TICKET_SECRET` 替换为本地开发专用的随机值。
- 如需管理后台，设置 `ADMIN_BOOTSTRAP_EMAIL`、`ADMIN_BOOTSTRAP_PASSWORD` 和可选的 `ADMIN_BOOTSTRAP_NAME`。

Web 默认连接 `http://localhost:4000/v1`。需要修改 API 地址或配置监控时，参考 [apps/web/.env.example](apps/web/.env.example)，将本地配置放到 `apps/web/.env.local`。Sentry 和独立更新日志站点不是启动核心功能的前提。

环境文件不入库；本地开发不要使用生产数据库或真实 SMTP 凭据。

### 3. 启动基础服务并初始化数据库

确认 Docker 已启动，然后执行：

```sh
npm run infra:up
npm run db:migrate
npm run db:seed-defaults
```

`infra:up` 启动 PostgreSQL 和 Mailpit。`db:seed-defaults` 写入默认学校、问卷和轮次，供本地初始化使用；缺少编译产物时会先构建 API。不要把它当作生产数据库的常规启动步骤。

如需创建首个管理员：

```sh
node apps/api/scripts/bootstrap-admin.mjs
```

管理员账号写入数据库后才能登录；只填写 `ADMIN_BOOTSTRAP_*` 并不会创建账号。

### 4. 启动应用

```sh
npm run dev
```

该命令先构建 shared，再启动 shared watcher、NestJS API 和 Next.js。首次验证可从注册开始，在 Mailpit 中读取验证码邮件。

| 服务 | 本地入口 |
| --- | --- |
| 用户网站 | [http://localhost:3000](http://localhost:3000) |
| 管理后台 | [http://localhost:3000/admin](http://localhost:3000/admin) |
| 商家登录 | [http://localhost:3000/merchant/login](http://localhost:3000/merchant/login) |
| API | [http://localhost:4000/v1](http://localhost:4000/v1) |
| Swagger | [http://localhost:4000/docs](http://localhost:4000/docs)，仅非生产环境启用 |
| Mailpit | [http://localhost:8025](http://localhost:8025)，接收本地 SMTP 邮件 |

使用 `Ctrl+C` 停止开发服务器，使用 `npm run infra:down` 停止本地基础服务。

## 技术栈与目录

| 层次 | 技术 |
| --- | --- |
| Web | Next.js 16、React 19、TypeScript、Tailwind CSS 4 |
| API | NestJS 11、Prisma 7、PostgreSQL、JWT 会话、Argon2 |
| 匹配 | 条件筛选、候选配对评分、`edmonds-blossom-fixed` 配对求解 |
| 测试与 UI 验证 | Jest、Vitest、Storybook、Playwright、MSW |
| 运行与监控 | Docker、GitHub Actions、Sentry；Web 与 API 分别部署 |

```text
apps/
  api/
    src/modules/       # 账号、问卷、轮次、见面、商家、核销等业务模块
    prisma/            # 数据模型与迁移
    scripts/           # 初始化、种子数据与生产启动脚本
    test/              # API e2e 测试
  web/
    src/app/           # 用户页面、管理后台、商家入口
    src/components/    # UI 与业务组件
    .storybook/        # Storybook 配置
packages/
  shared/              # 前后端共享类型、规则与工具函数
scripts/               # 仓库工具、Git hooks、CSS 校验与视觉证据
docs/archive/          # 按日期命名的扁平文档归档
.github/workflows/     # CI 与 Storybook 验证
```

Web 通过 `/v1` API 访问业务数据，NestJS 处理业务与定时任务，Prisma driver adapter 连接 PostgreSQL。数据库连接配置位于 `apps/api/src/common/prisma/client.ts`，不在 Prisma schema 中声明 URL。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 同时启动 shared、API、Web |
| `npm run dev:web` / `npm run dev:api` | 单独启动 Web 或 API，先构建 shared |
| `npm run build` | shared 构建、Web 类型检查、Web 与 API 生产构建 |
| `npm run typecheck:web` / `npm run typecheck:api` | 对应工作区的类型检查 |
| `npm run lint` | 全仓库 lint；API lint 含自动修复，运行后检查 diff |
| `npm run lint:css -- <文件路径>` | 校验指定 Web CSS |
| `npm run db:generate` | schema 或 Prisma 依赖变化后重新生成客户端 |
| `npm run db:migrate` | 开发环境创建／应用迁移 |
| `npm run db:migrate:deploy` | 应用已有迁移 |
| `npm run storybook:web` | 启动组件开发环境 |
| `npm run infra:local:api` | 在 Docker 中运行可选的本地 API、数据库和 Mailpit |

## 测试与协作

按改动范围选择检查：

```sh
npm run test:shared
npm run test --workspace web
npm run test --workspace api -- --runInBand
npm run test:e2e --workspace api -- --runInBand
npm run test:hooks
```

API 单元测试不依赖运行中的数据库；e2e 测试会应用迁移并写入测试数据，只能连接本地或专用测试数据库。

UI 改动可使用以下命令运行浏览器 smoke 测试与生成截图：

```sh
npm run build-storybook:web
npm run test:storybook:web -- --run
npm run screenshots:storybook:web
```

针对具体页面状态的截图筛选和 PR 发布方式见 [Web 视觉验证](docs/archive/2026-09-08-web-visual-verification.md)。截图与构建产物不提交到应用分支。

Git pre-commit 检查暂存文件，pre-push 执行 lint 并检查是否产生未提交改动。GitHub Actions 的主 CI 覆盖构建、类型检查、lint、单元和 e2e 测试；Storybook 工作流在 PR 或手动触发时提供浏览器测试与截图产物。远程提交以该提交的 CI 结果为准。

Agent 协作规则统一维护在 [AGENTS.md](AGENTS.md)，API 与 Web 的补充规则分别位于各自工作区。仓库不再维护 Claude／Cursor 专用规则或配置生成器。

## 部署

- **Web**：通过 Vercel 独立部署，配置 API 地址及所需的前端环境变量。
- **API**：使用 `docker-compose.prod.yml` 和 `apps/api/Dockerfile.prod`，生产数据库独立于本地 PostgreSQL。
- **生产配置**：通过 Docker secret `api_env` 挂载，由 `production-entrypoint.mjs` 加载；不要使用 compose `environment` 或 `env_file` 暴露生产凭据。
- **Source maps**：Sentry 上传使用 BuildKit secret `sentry_auth_token`。

发布前检查对应提交的 CI，并按 [生产发布与回滚流程](docs/archive/2026-06-02-production-release-flow.md)操作。本地 `infra:*` 命令不用于生产部署。

## 文档入口

完整清单见 [按时间排列的文档归档](docs/archive/2026-09-08-documentation-index.md)。归档包含旧版本设计与实施计划，请结合来源日期和当前代码阅读。

| 文档 | 内容 |
| --- | --- |
| [本地开发](docs/archive/2026-09-08-local-development.md) | 工具链、基础服务与初始化 |
| [Web 设计系统](docs/archive/2026-05-23-web-design-system.md) | Tokens、基础组件与业务组件边界 |
| [Web 视觉验证](docs/archive/2026-09-08-web-visual-verification.md) | Storybook、截图与 PR 证据 |
| [见面流程设计](docs/archive/2026-05-14-meetup-contract-design.md) | 见面协商与交互约定 |
| [破冰流程验收](docs/archive/2026-05-15-meetup-icebreak-manual-testing.md) | 人工验证步骤 |
| [优惠券规则与核销](docs/archive/2026-05-23-merchant-coupon-rule-and-redemption.md) | 优惠规则及核销流程 |
| [商家推广验收](docs/archive/2026-05-23-merchant-promotion-manual-testing.md) | 商家与推广功能检查 |
| [生产发布](docs/archive/2026-06-02-production-release-flow.md) | 容器启动、验证与回滚 |
