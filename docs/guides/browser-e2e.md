---
kind: howto
lang: zh
---

> 文档归属：[本目录入口](README.md)。

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

首页构建需要可读的真实 API。`node scripts/e2e/run.mjs --build-only` 复用相同的一次性数据库、迁移、合成数据和 API，完成 shared/API 构建、Web 类型检查和生产构建后退出并清理；不启动浏览器，也不代表业务验收通过。CI 的根构建使用此入口，避免连接未启动的 localhost API 或生产数据。该模式不能与 `--api`、`--serve` 或浏览器参数混用。

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
- 管理员登录并修改轮次状态，重新加载用户页面后可见缓存收敛；普通用户不能访问后台 API。
- 首页平台与学校统计由服务端快照呈现；停留、隐藏和恢复可见均不追加浏览器公开统计请求。
- 事务提交后的公开缓存通知、重复 revision、30 分钟领取门限、有界故障重试与上游故障保留。
- 同源 Vercel 静态资源加载、PWA 安装/升级、失败安装保留旧 worker，以及隔离源站不可达后的离线页面。
- 登录、注册入口、找回密码页面和 VIP 客服弹窗的截图比较、溢出检查。

普通资料测试通过真实 API 准备完整问卷，并断言返回 `SUBMITTED`；这不等于已经覆盖浏览器逐题填写整份问卷。匹配展示测试准备已发布数据，不替代现有 API 匹配算法/周期执行测试。到期测试修改隔离数据库时间字段，不修改机器时钟。

浏览器项目：桌面 Chromium、移动尺寸 Chromium、桌面 WebKit、移动尺寸 WebKit。移动尺寸和 WebKit 均为模拟环境，不代表真实 iPhone 或安装版 Safari 验收。普通功能套件禁用 Service Worker；`pwa.spec.ts` 与 `pwa-origin-failure.spec.ts` 专门启用它，验证同源安装、无凭据预缓存、旧 worker 升级、图标 503 时保留旧 worker、完整离线文档与图标。WebKit 的浏览器全局断网模拟存在已知缺陷，该模拟场景注明跳过；实际关闭每条用例的临时 HTTP 源站用于补充真实不可达验收。

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

`.github/workflows/browser-e2e.yml` 在 PR 和 main push 运行 Chromium + 移动 WebKit 核心流程；手动和夜间运行四项目全量功能测试。另执行视觉比较。独立矩阵在四个浏览器项目补跑 SSR 故障、VIP 未知初值和更新列表的四种上游响应；这些用例在普通运行中因缺少专用环境而跳过。CI 重试一次供排障，但 `failOnFlakyTests` 会让重试才通过的用例仍使任务失败。

本地完整验收还需运行专用场景：

```bash
node scripts/e2e/run.mjs --contract-proxy private-contracts.spec.ts vip-refresh.spec.ts --grep 'private-contracts\.spec\.ts|null bootstrap'
node scripts/e2e/run.mjs --devlog-fixture=items updates-feed.spec.ts
node scripts/e2e/run.mjs --devlog-fixture=empty updates-feed.spec.ts
node scripts/e2e/run.mjs --devlog-fixture=failure updates-feed.spec.ts
node scripts/e2e/run.mjs --devlog-fixture=malformed updates-feed.spec.ts
node scripts/e2e/run.mjs sentry-cache-tracing.spec.ts --sentry-tracing
```

每轮输出 `artifacts/e2e/<run-id>/`：HTML 报告、JSON 结果、服务日志、失败截图/视频/trace、运行耗时信息。`latest.json` 供报告命令找到最近一次运行。CI 即使失败也上传证据并保留 7 天。文件均在 Git 忽略目录，不提交运行产物；已审核基准图除外。

运行器、测试或业务变更后，先跑受影响用例；通过后再跑对应浏览器项目。不要依赖截图、HTTP 200 或构建成功单独判断业务完成。CI 工作流只有提交推送后才会实际触发，本地通过不代表远程 CI 已通过。

## 图片等待与性能证据

`node scripts/e2e/run.mjs e2e/specs/loading-performance.spec.ts` 验证关于页的三幅完整裁切预览随 HTML 呈现，图片延迟、404 或解码失败时正文与链接保持可用，并覆盖脚本延迟、失败、禁用、首页首次原生跳转、正常和减少动画设置。高清验收仍要求原 atlas 真实解码、三个裁切共用一份请求，以及冷暖访问滚动后的全页图片完成；预览不能代替高清完成。一对一页面继续保留原有 `ImageReadyPage` 等待与有界回退。首页使用 `e2e/specs/home-artwork-preload.spec.ts` 验证完整预览先显示、高清原位完成、单份响应式资源、图片失败、字体延迟、滚动、回访和浏览器前进后退；`e2e/specs/home-native-navigation.spec.ts` 验证脚本延迟、失败、禁用时的首屏链接，以及共享菜单初始化前后和断点行为。

浏览器用例保留各状态截图和脱敏 JSON；断言轮询时间不解释为精确渲染时刻或冷服务器指标。正式修改前后性能证据使用[性能对照工具](../../scripts/performance/README.md)，分别记录完整预览与高清就绪时间，不以占位图可见替代高清完成。全部证据使用隔离服务与合成数据，不保存身份信息。

## In-app browser 隔离预览

```bash
node scripts/e2e/run.mjs --serve --serve-minutes=30
```

复用相同的一次性数据库、合成数据和生产构建，服务就绪后生成 `artifacts/e2e/<run-id>/session.json`，只包含 runId、pid、webUrl、apiUrl、mailUrl、expiresAt。用其中的 webUrl 在 Codex in-app browser 查看；不访问已有开发数据库。默认 30 分钟，最短 1 分钟、最长 90 分钟；到期自动清理，Ctrl+C 或 SIGTERM 也会清理。性能对照可用 `--extra-client-origin=http://127.0.0.1:<port>` 将第二个本地 Web 加入本轮 API 的 CORS 白名单，必须与 `--serve` 同用，只接受精确 loopback origin。API、Web、数据库或 Mailpit 提前退出会使本轮失败。结束时删除 session.json；留存 run.json 和脱敏证据。此模式只提供人工视觉检查环境，不代表自动测试通过。

## 静态图片复现

当前测试环境只启动 Web/API/Mailpit，不启动独立静态 CDN。所有图片、JS、CSS、字体和图标按同源 Vercel 路径验证；旧候选退出说明见[静态资源托管](static-cdn.md)。

压缩需使用从明确 Git 版本或保留来源恢复的原始 `public` 目录，不能对已发布的 WebP 递归重压，也不能假定旧 PNG 仍在当前工作树。使用项目已有 sharp，在独立且为空的输出目录复现：

```bash
node scripts/images/compress-assets.mjs --source /absolute/path/to/original-public --output artifacts/images/rebuilt
```

命令生成带内容 hash 的 WebP、二维码预览和 `compression-report.json`，记录原始/输出字节、尺寸、压缩策略、alpha 检查及二维码无损像素断言。背景和头像允许既定有损策略，不能沿用旧候选的“所有图片像素等价”结论；视觉清晰度、二维码可用性和完整加载仍通过真实页面验收。
