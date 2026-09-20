# 浏览器自动化测试

E2E 由 Node.js 24 + Playwright Test 执行，运行时不调用模型。保留现有 Jest/Supertest API 集成测试、Vitest 单元测试与 Storybook 组件测试。

## 首次准备

需要 Node 24、npm 11、运行中的 Docker，以及首次拉取镜像的网络。

```bash
npm ci
npx playwright install chromium webkit
# Linux 首次安装浏览器系统依赖：
# npx playwright install --with-deps chromium webkit
```

## 日常命令

```bash
npm run test:e2e:infra           # 数据库目标与环境隔离保护测试
npm run test:e2e:web             # Chromium 核心用户流程
npm run test:e2e:web:full        # 四个浏览器项目的全部功能测试
npm run test:e2e:web:visual      # 已审核基准图的截图比较
npm run test:e2e:web:ui          # 交互调试；关闭 UI 后自动回收服务
npm run test:e2e:web:report      # 打开最近一次 HTML 报告
npx tsc -p e2e/tsconfig.json     # 测试代码类型检查
```

按文件或用例运行时直接使用统一运行器，仍会完整准备隔离环境：

```bash
node scripts/e2e/run.mjs e2e/specs/profile.spec.ts --project=chromium
node scripts/e2e/run.mjs --project=webkit --grep @smoke
node scripts/e2e/run.mjs --project=chromium --grep @smoke --repeat-each=10
```

不要直接运行 `npx playwright test`，也不要传入开发或生产数据库地址。Playwright 配置与数据工厂会拒绝未经过运行器准备的环境。`--repeat-each` 重用服务但每条用例使用新账号；验证完全冷启动需重复执行整个运行器。

## 环境与安全边界

运行器复制当前工作区源码（包括未提交修改），排除 `.env*`、构建产物和生成客户端；在 `artifacts/e2e/<run-id>/workspace` 中构建，链接已安装依赖，不改开发环境配置。

每轮启动带独立名称的 PostgreSQL 17 和 Mailpit 容器，绑定随机 loopback 端口。数据库名限定为 `lilink_e2e_<run-id>`，拒绝默认 5432 端口及远程地址。只加载显式生成的测试环境变量和临时签名密钥。数据库使用临时存储，结束或收到 SIGINT/SIGTERM 时停止本轮进程组、删除本轮容器和源码副本；不会运行全局 Docker prune。

Next.js 的 `LILINK_BUILD_WORKSPACE_ROOT` 仅用于让临时源码副本中的 Turbopack 能解析链接的依赖；默认构建行为不变。服务使用生产构建，API 的业务环境为 `APP_ENV=test`。测试数据通过 Prisma 或真实 API 准备，实际操作由浏览器完成。注册及找回密码从 Mailpit 接收真实 SMTP 邮件，不读取数据库验证码或使用开发后门。

每条用例通过本地受信代理头使用独立的合成客户端 IP，避免多用户场景误共享 IP 限流桶；另有同一客户端第六次激活返回 429 的用例验证限流仍然生效。

全局匹配周期测试会在 `finally` 恢复状态。目前每个运行器固定一个 worker，避免共享周期的用例相互污染；独立运行器可以并行，因为端口、容器、数据库和构建输出互不共用。

若进程被 SIGKILL 或机器断电，正常清理无法执行。先按日志中的 run-id 检查 `docker ps -a --filter label=lilink.e2e=<run-id>`，仅清理确认属于该次测试的容器和 workspace。

## 覆盖范围

- 登录、退出、保护路由、会话丢失。
- 学校邮箱注册、SMTP 收信、创建账号、重新登录。
- 找回密码、旧密码失效、新密码登录。
- 完整资料保存及刷新回读；未完成资料的草稿和报名门槛。
- 保存接口 503 时不误报成功、保留输入、恢复后保存。
- 快速返回资料页后继续编辑。
- 报名、刷新、取消报名；截止时间到达后拒绝旧页面提交。
- 已发布匹配的对象、来信交互、刷新后结果；未匹配结果。
- VIP 兑换、刷新、重复兑换幂等、无效码、到期状态。
- 管理员登录并修改轮次状态，用户端同步变化；普通用户不能访问后台 API。
- 登录、注册入口、找回密码页面和 VIP 客服弹窗的截图比较、溢出检查。

普通资料测试通过真实 API 准备完整问卷，并断言返回 `SUBMITTED`；这不等于已经覆盖浏览器逐题填写整份问卷。匹配展示测试准备已发布数据，不替代现有 API 匹配算法/周期执行测试。到期测试修改隔离数据库时间字段，不修改机器时钟。

浏览器项目：桌面 Chromium、移动尺寸 Chromium、桌面 WebKit、移动尺寸 WebKit。移动尺寸和 WebKit 均为模拟环境，不代表真实 iPhone 或安装版 Safari 验收。普通功能套件禁用 Service Worker，因此 PWA 安装、缓存升级和离线体验需要单独的专用套件。

第三方支付、真实邮件到达率、真实用户数据均不在本套件范围内。外部图片的完整下载不作为页面就绪条件；用可见业务状态判断就绪。

## 视觉基准

基准保存在 `e2e/baselines/<platform>/<project>/`，普通运行只比较，不自动接受差异。新增或有意调整页面时：

```bash
npm run test:e2e:web:visual -- --update-snapshots
```

逐张检查实际图和差异，再将通过审阅的 PNG 与改动一起提交。不要仅因为测试失败而更新基准。操作系统和浏览器版本不同的图不混用；升级 Playwright 时同步检查基准。Linux 视觉 CI 使用仓库的 Node 24.20.0 / Debian Bookworm 容器，固定 Playwright 1.60.0；macOS 基准仅用于本机。可以从本机 Docker 生成或复验相同的 Linux 基准：

```bash
npm run test:e2e:web:linux -- --grep @visual
# 首次创建或有意更新后，仍须检查 PNG：
npm run test:e2e:web:linux -- --grep @visual --update-snapshots
```

Linux 包装器只复制源码，使用容器内独立依赖卷。报告写入 `artifacts/e2e-linux-results/`。它使用本地 Docker 的 host network 和 daemon socket 来创建并回收自己的 PostgreSQL/Mailpit 容器，不支持远程 Docker daemon。首次构建需要下载浏览器和系统依赖；后续复用镜像层缓存。

## CI 与证据

`.github/workflows/browser-e2e.yml` 在 PR 和 main push 运行 Chromium + 移动 WebKit 核心流程；手动和夜间运行四项目全量功能测试。另执行视觉比较。CI 重试一次供排障，但 `failOnFlakyTests` 会让重试才通过的用例仍使任务失败。

每轮输出 `artifacts/e2e/<run-id>/`：HTML 报告、JSON 结果、服务日志、失败截图/视频/trace、运行耗时信息。`latest.json` 供报告命令找到最近一次运行。CI 即使失败也上传证据并保留 7 天。文件均在 Git 忽略目录，不提交运行产物；已审核基准图除外。

运行器、测试或业务变更后，先跑受影响用例；通过后再跑对应浏览器项目。不要依赖截图、HTTP 200 或构建成功单独判断业务完成。CI 工作流只有提交推送后才会实际触发，本地通过不代表远程 CI 已通过。
