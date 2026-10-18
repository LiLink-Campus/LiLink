---
kind: changelog
lang: zh
---

# 普通邮箱与教育认证验收（2026-10-19）

> 文档归属：[验收记录](README.md)。现行契约见[账户参考](../reference/account.md)、[匹配参考](../reference/matching.md)，设计依据见[教育身份决策](../decisions/2026-10-19-education-verification.md)。

## 环境与效力

工作区基点 `0c5be65c84100f6044167b0e15d96e95caa58dea`，`sourceDirty: true`，证据对应本地未提交修改。macOS arm64、Node 24.20.0、npm 11.19.0、Docker 29.5.2、Playwright 1.60.0；实际隔离引擎 Chromium 148.0.7778.96、WebKit 26.4。移动 WebKit 模拟 iPhone 13；不代表安装版 Safari 或实体 iPhone。

运行器创建随机端口的 PostgreSQL 17 与 Mailpit v1.20、一次性数据库、合成账号及邮箱，执行迁移后运行，正常结束自动销毁。这些隔离 E2E 没有连接开发或生产数据库，没有发送真实用户邮件；后续本地开发服务修正单独记录于下文。Mailpit 收件不证明真实邮箱送达。

## 复现命令与结果

前提为项目锁定依赖、Docker、已安装的隔离 Chromium/WebKit 与可用本地端口；从仓库根目录执行。

```sh
node scripts/e2e/run.mjs --api
node scripts/e2e/run.mjs education.spec.ts auth.spec.ts admin-matching-lifecycle.spec.ts --project=chromium --project=webkit --project=mobile-webkit
node scripts/e2e/run.mjs admin-users-workflow.spec.ts --project=chromium --project=webkit --project=mobile-webkit
npm run test:ci:stories
npm run typecheck:api
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc -p e2e/tsconfig.json
npm run lint:api
npm run lint:web
npm run lint:css -- apps/web/src/app/dashboard/me/education-card.module.css apps/web/src/app/dashboard/_components/member-identity.module.css
npm run docs:check
npm run docs:verify
```

| 检查 | 最终结果 | 本机工件 |
| --- | --- | --- |
| 全量 API PostgreSQL E2E | 36 suites、202/202，无跳过 | `artifacts/e2e/9a61ba18f798/api-results.json`、`run.json` |
| 注册、认证、匹配揭晓浏览器专项 | 19/19，无跳过或重试；Chromium 12、桌面 WebKit 3、移动 WebKit 4 | `artifacts/e2e/39b27d6e18a6/results.json`、`report/`、`run.json` |
| 后台用户与教育认证额度 | Chromium 6/6；补充桌面、移动 WebKit 后合计 8/8，无失败或重试 | `artifacts/e2e/5c268f345997/results.json`；`artifacts/education-acceptance/admin-browser/results.json`、`run.json` |
| 500 人批量与优先级复核 | 9/9；冲突回滚后生成 250 个唯一配对 | `artifacts/e2e/32ad17a1dce4/api-results.json` |
| 既有 API 单元回归 | 574/574；权重边界修正后相关引擎、worker、轮次 69/69 再次通过 | `artifacts/education-api-unit-final.log`、`artifacts/education-engine-final.log` |
| Shared 与 Web 既有测试 | 88/88、110/110 | `artifacts/education-shared.log`、`artifacts/education-web-tests.log` |
| Storybook 固定行为集合 | 221/221，未跳过必要用例；4 个展示文件不属于固定集合 | `artifacts/storybook-results.json` |
| 类型、构建、lint、CSS、diff | 通过；Web lint 保留两条既有 warning | `artifacts/education-checks-final.log`、`artifacts/education-web-lint-final.log`；运行器 `build.log` |

API E2E 曾因新增权重精度检查重复计算每个端点而误拦 500 人池，修正上界后重跑相关 9 项，再重跑完整 202 项通过。浏览器曾发现事务 advisory lock 的 `void` 返回值不能通过 Prisma 读取，已改为执行接口；修正后的注册和两条认证路径均完成真实接口、持久化和回显验证。

后台最后一次 8 项复核直接使用本任务拥有的隔离 `--serve` 服务（`ce2cda3dc5c8`），连接前核验容器标签和测试数据库标识；复现命令会重新创建同等隔离环境。运行元数据单独保存在 `admin-browser/run.json`，不混同此前 Chromium 6 项运行。

## 外部行为断言

- 普通邮箱可在没有邀请码和学校的条件下注册、登录、完善资料并报名。自行选择学校不自动授予教育身份；注册邀请码只记录归因，不占教育认证额度。
- 无效邀请码在表单显示错误；有效邀请码升级教育身份，刷新后保持。原账号与登录邮箱不变，重复认证不重复扣额度。两个账号竞争最后一个名额时仅一人成功，未认证邀请人即使有额度也不能授予教育身份。
- 教育邮箱校验使用真实 Mailpit 验证码。普通邮箱不能充当教育邮箱；错误验证码和跨账号重放均拒绝，正确验证码写入教育邮箱、学校及认证状态，原登录邮箱保持不变。
- 真实管理员准备、揭晓、用户来信、快照与 Mailpit 回执完成；重复揭晓不重复引荐。数据库场景验证 VIP、连续两次落空、教育身份的竞争顺序、硬条件与历史身份冻结。
- 结果页及历史页覆盖 VIP普通用户、VIP教育用户、教育用户、普通用户；两种普通身份均显示用户指定提醒，教育身份不显示该提醒。举报后对方身份及其他可识别信息一起隐藏。
- 迁移升级验证已有账号保留 LEGACY 教育身份，账号与私有历史继续保留；没有历史身份字段的旧轮次明确显示未记录。

## 视觉证据

Codex in-app browser 检查 1280×900 与 375×812，覆盖注册入口、普通邮箱、可选学校、用户中心未认证与已认证、两种认证表单、教育邮箱错误、四类身份、普通身份提醒、历史详情弹窗、邀请额度说明，以及后台学校认证资格和教育认证邀请额度表单。引擎专项另检查 320、375、390、879、880、1280 宽度，无横向溢出；后台额度编辑也通过桌面、移动 WebKit 的溢出断言和截图核对。

本机证据位于 `artifacts/education-acceptance/iab/`，截图采用与实际编码一致的 `.jpg` 后缀。此处采用明确的合成视觉夹具；认证成功与配对成立的业务证据来自上述真实浏览器/API E2E，不以视觉夹具替代。浏览器专项的断言附件与 PNG 截图保存在对应 `results/` 子目录。验证码、密码、Cookie 和环境文件未作为截图或附件保存。

可重复打开隔离视觉环境：

```sh
node scripts/e2e/run.mjs --serve --serve-minutes=30
```

从该次 `session.json` 读取临时地址；使用该次一次性数据，退出后自动清理。认证和匹配的确定性场景由 `e2e/specs/education.spec.ts` 重建，不复用已有用户数据库。

## 注册页批注修订与本地服务同步

用户在 `localhost:3000/register/personal` 看到旧的邀请码限制。现场核对发现 4000 端口由 Colima 转发至 `lilink-api-local`，容器挂载的是新源码，但运行的旧编译产物仍包含该限制；本地库也缺少教育身份字段。已在确认目标为 Compose 本地 `lilink` 数据库后执行迁移并重启该 API 容器。没有重置数据库、修改凭据或操作生产环境。

复现同步命令：

```sh
docker exec lilink-api-local npm run prisma:migrate:deploy --workspace api
docker restart lilink-api-local
```

迁移成功后读回三个教育身份字段；运行态已加载教育认证路由。使用合成普通邮箱、无邀请码直接请求本地 API，返回 201 与 `ORDINARY_EMAIL`，邮件仅进入本地 Mailpit，没有创建账号。脱敏结果见 `artifacts/registration-ui-fix/local-api-check.json`。

学校邮箱页修订如下：邮箱下方合并为“不是学校邮箱？改用普通邮箱注册”，删除“不支持此邮箱后缀”和下方重复入口；不支持的域名在点击发送验证码后弹窗提示，不发起学校验证码请求。弹窗提供普通注册与返回修改两个操作，支持 Escape、焦点恢复，切换注册方式保留 `next`。服务端返回学校认证资格变化时也使用同一弹窗。注册表单其他错误和学校列表错误仍保留原处理。

隔离回归复现命令：

```sh
node scripts/e2e/run.mjs registration-routing.spec.ts auth.spec.ts education.spec.ts --project=chromium --project=webkit --project=mobile-webkit
npm run test:ci:stories
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc -p e2e/tsconfig.json
npm run lint:web
npm run lint:css -- apps/web/src/app/register/school-email-notice.module.css apps/web/src/app/register/school-email-support.module.css
```

首次回归发现 WebKit 关闭弹窗后未恢复按钮焦点，已显式恢复触发元素；另修正了一条误认为任意查询参数都应传递的测试断言，保留现行 `next` 契约。内置浏览器核对桌面、766×896 和 375×812 的合并入口、弹窗、关闭和普通注册跳转；截图保存在 `artifacts/registration-ui-fix/iab-*.jpg`。隔离 Chromium 另断言 320、375、766、879、880、1280 宽度的弹窗边界和页面无横向溢出。

中间运行 `b1cb6201037d` 的弹窗场景六项全部通过，但普通注册的移动 WebKit 场景出现一次输入值为空，页面提示“请先填写有效邮箱”，没有发出验证码请求，最终为 22/23。这不是邀请码门槛错误；没有证明其根因，也不能仅凭后续通过宣称已消除此不稳定性。已为该流程补充邮箱值保留和发送成功的断言，并将既有延迟脚本加载注册用例扩展至两种 WebKit 配置，保留前次失败记录，不使用自动重试掩盖。修订未改变普通邮箱页的输入处理代码。

最终运行 `4968e60496f4` 为 **25/25**（Chromium 12、桌面 WebKit 6、移动 WebKit 7），无跳过或自动重试；真实普通注册、两种教育认证、延迟脚本加载注册和弹窗交互均通过。结果、报告与附件见 `artifacts/e2e/4968e60496f4/results.json`、`report/index.html`、`results/`，控制台日志见 `artifacts/registration-ui-fix/e2e-accepted.log`。Storybook 固定集合 221/221；类型、CSS 与 lint 通过，lint 仅保留两条既有 warning。汇总与源码摘要见 `artifacts/registration-ui-fix/report.json`。本节未重新执行完整 Linux 固定集合，覆盖边界沿用下文说明。

## 邮箱与验证码行间距对齐

内置浏览器实测普通邮箱两行之间为 20px，学校邮箱因辅助入口独立占行及额外表单 gap 达到约 51.2px。仅调整 `school-email-support.module.css`，让辅助入口复用现有 20px 间距，保留学校列表、匹配学校提示及普通注册入口；窄屏提示换行时允许内容自然增高，避免覆盖验证码标签。

复现：`node scripts/e2e/run.mjs registration-routing.spec.ts --project=chromium --project=webkit --project=mobile-webkit`。隔离运行 `4ccecb3d9407` 为 **9/9**，无跳过或重试。空邮箱和已识别学校的间距均与普通邮箱相等；覆盖 Chromium 的 320、375、766、1280 宽度，以及桌面和移动 WebKit，断言提示不遮挡验证码、页面无横向溢出，并复核原弹窗交互。逐视口测量 JSON 与截图位于 `artifacts/e2e/4ccecb3d9407/results/`，结果见 `results.json`、`report/index.html`。

内置浏览器完成桌面、766×896 与 375×812 核对，截图位于 `artifacts/registration-spacing/`。Storybook 固定集合 221/221，CSS 检查、E2E 类型与 diff 检查通过。此次没有修改认证或匹配逻辑，没有访问用户浏览器配置或生产环境；Linux 固定集合边界仍见下文。

## VIP 与教育身份独立标志

按后续确认，名字旁展示两个独立维度：有效 VIP 显示 VIP 标志，未开通、撤销或失效时不显示；教育身份始终单独显示“教育用户”或“非教育用户”。移除“VIP教育用户”“VIP普通用户”等合并标签。用户中心的标志从教育认证卡片移至账号信息区，复用原 VIP 标志的皇冠、配色和动效；匹配来信、历史卡片及历史详情弹窗也采用同一标志组件。非教育用户提醒继续保留，与是否 VIP 无关。VIP 权益对比中的免费身份明确命名为“非 VIP 用户”，不与教育身份混用。

教育状态提升至用户中心的单一读取，认证卡片负责操作并提交验证后的结果；顶部标志与卡片共享状态，认证成功立即更新，失败可重试，读取未完成或失败时不误标为非教育用户。读取按账号隔离，取消已卸载请求，不重复发起同一页面的教育状态 GET。

复现命令：

```sh
node scripts/e2e/run.mjs education.spec.ts member-badges.spec.ts --project=chromium --project=webkit --project=mobile-webkit
npm run test:ci:stories
npm run test:shared
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc -p e2e/tsconfig.json
npm run lint:web
```

隔离运行 `ff6946962535` **13/13**（Chromium 5、桌面 WebKit 4、移动 WebKit 4），无跳过或自动重试。断言四种组合、无 VIP 时标志缺席、单次教育状态读取、卡片无重复标志、两种真实认证成功及刷新后状态、错误重试、结果与历史中的独立标志、非教育提醒及举报隐藏边界。另覆盖 320、375、766、879、880、1280 宽度无横向溢出。结果与附件见 `artifacts/e2e/ff6946962535/results.json`、`report/index.html`、`results/`。

Storybook 固定集合 221/221、Shared 88/88；类型、相关五份 CSS 与 Web lint 检查通过，仅保留既有两条 lint warning。内置浏览器在隔离 `9e8d88ae4f42` 环境使用合成账号，核对桌面 1280、766 和移动 375 宽度的四种组合、认证卡片、来信、独立历史页、历史详情弹窗与 VIP 对比文案。图像与复现夹具脚本位于 `artifacts/member-badges/`，视觉夹具不代替真实认证 E2E。没有变更生产数据、认证判定或匹配优先级；Linux 固定集合和远端 CI 边界仍见下文。

## 未完成的覆盖与发布边界

`npm run test:ci` 与随后一次 `npm run test:ci:core` 均在 Linux 容器的 `npm ci` 阶段遇到 `ECONNRESET`，尚未进入完整固定集合；日志为 `artifacts/education-fixed-ci.log` 和 `artifacts/education-fixed-ci-retry.log`。不能将本机通过等同于完整 Linux 门禁、Linux 像素基准或远端 CI 通过。文档 preview 的一条既有 EVD001 位于旧性能验收记录，已人工复核，不在本次修改范围。

本次没有 commit、push、merge 或生产迁移、部署。迁移和新认证状态进入生产仍须取得对应授权并按项目发布流程操作。

## 用户中心统一面板与认证弹窗

采用已确认的 `artifacts/designs/user-center-lower-layout-2026-10-19-v1.png` 设计。VIP 保持原位置与样式；下方合并为教育认证、权益、账号设置及注销入口。认证使用单入口与原生 dialog，邀请码/教育邮箱表单按需挂载；提交或发码期间禁止关闭、切换，成功同步身份后关闭。所有列表行共用 80px 最小高度、14px 上下内边距，注销账号不因单行文案缩窄。

环境：macOS、项目 Node/npm、隔离 PostgreSQL 17 与 Mailpit、合成账号；未访问生产数据，未提交注销。以下命令从仓库根目录执行，Docker 与 Playwright 引擎须可用：

```sh
npm run typecheck:web
npm run lint:web
npm run lint:css -- apps/web/src/app/dashboard/me/user-center.module.css apps/web/src/app/dashboard/me/education-card.module.css
npx tsc -p e2e/tsconfig.json
npm run test:ci:stories
node scripts/e2e/run.mjs e2e/specs/education.spec.ts e2e/specs/member-badges.spec.ts --project=chromium --project=webkit --project=mobile-webkit
node scripts/e2e/run.mjs e2e/specs/user-center-layout.spec.ts --project=chromium --project=webkit --project=mobile-webkit
```

结果：类型、CSS、E2E 类型与 lint 通过（lint 保留两项既有警告）。Storybook 固定集合 221/221。真实邀请码与邮箱升级、身份矩阵和读取重试 13/13，run `5ee7a36686f3`；统一行高与弹窗布局 3/3，最终 run `569b2d6e346a`。初次布局 run `6fe0cbad8c94` 发现 WebKit 关闭弹窗后未恢复入口焦点，已显式恢复并通过复验，未放宽断言或使用重试。

布局断言覆盖 320、375、550、747、879、880、1104、1280px：邀请、优惠券、添加到桌面（未安装时）、修改密码与注销等高，无横向溢出；桌面账号与 VIP 并列，移动端 VIP 跟随账号；认证方式选择、切换、Escape、关闭、焦点恢复及注销弹窗打开/取消通过。认证升级覆盖错误邀请码、普通邮箱拒绝、错误验证码、跨账号验证码隔离和成功持久化，登录邮箱保持不变。

可复核工件：

- `artifacts/e2e/569b2d6e346a/report/index.html`：三引擎布局断言、JSON 附件和桌面/移动截图。
- `artifacts/e2e/5ee7a36686f3/report/index.html`：真实认证与身份回归。
- `artifacts/user-center-layout/{typecheck,lint,stories,e2e-final}.log`：本地命令输出。
- `artifacts/user-center-layout/iab-desktop.jpg`、`iab-mobile.jpg`：内置浏览器完整面板，使用 Storybook 合成账号，包含安装入口。
- `artifacts/user-center-layout/iab-chooser-mobile.jpg`、`iab-invite-mobile.jpg`、`iab-email-mobile.jpg`：内置浏览器移动认证弹窗。

内置浏览器人工检查桌面 1280px 与移动 375px 的布局、文案、图标和两种认证弹窗。WebKit 为 Playwright 引擎覆盖，不代表物理 iPhone 或安装版 Safari。隔离服务已由 runner 清理。仅本地实现，未 commit、push 或部署；既有 Linux 固定门禁下载阻塞和远程 CI 未执行的限制不变。

### 认证表单细节与折叠提案

移除两种认证表单顶部的分割线；“发送认证验证码”移至验证码输入框右侧并底部对齐，窄屏保持同一行。`npm run typecheck:web`、CSS 校验通过。独立 WebKit 检查 `node artifacts/user-center-layout/verify-form.mjs`（先以 6006 端口启动 Storybook），覆盖 320/375/472/1280px 的两种表单无分割线、发码按钮右置及无溢出；四项宽度全部通过，工件 `artifacts/user-center-layout/form-results.json`、`form-webkit-*.png`。内置浏览器 472px 与 1280px 人工检查并保存 `form-*-iab-*.jpg`。

真实认证回归命令：`node scripts/e2e/run.mjs e2e/specs/education.spec.ts --project=chromium --project=webkit --project=mobile-webkit`，run `b3e4614b042f`，10/10。使用隔离合成账号、PostgreSQL 与 Mailpit，结果位于对应 run 的 `report/index.html`；日志 `artifacts/user-center-layout/form-e2e.log`。

折叠页面仅生成预览提案 `artifacts/designs/user-center-accordion-2026-10-19-v1.png`，尚未实现折叠行为。教育认证保持直达；权益与账号设置提供收起/展开设计。生成图的头像和 VIP 图标变化不属于拟议修改范围。
