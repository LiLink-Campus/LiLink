# Storybook 全站覆盖

本轮复用 `apps/web` 正式页面、布局和组件。Storybook 中的数据、身份与接口响应均为合成测试数据；接口由 MSW 拦截，不调用真实注册、报名、注销、后台管理或核销接口。

## 页面范围

源代码共有 40 个页面路由，其中 32 个实际页面、8 个仅跳转路由；另有 3 个布局与 4 个系统状态入口。所有实际页面与可见组件已接入 Stories。没有将已经退出路由的旧界面重新开放。

| Storybook 分组 | 页面 | 代表状态 |
| --- | --- | --- |
| 全站 / 公开页面 | `/`、`/about`、`/schools`、`/updates`、`/terms`、`/privacy` | 首页有 / 无轮次、学校域名目录、更新分页 / 空列表 |
| 全站 / 账号流程 | `/login`、`/register`、`/register/school`、`/register/personal`、`/forgot-password` | 登录失败、注册方式、两类邮箱的验证与密码步骤、发码失败、重置密码步骤 |
| 全站 / 公开页面 | `/i/[code]` | 验证中、接受邀请、无效邀请 |
| 全站 / 用户中心 | `/dashboard`、`/dashboard/profile` | 新用户、已报名、无轮次、修改意向、取消报名 / 失败、资料三个分组、完整资料、日期弹窗、联系方式保存 / 失败 |
| Dashboard / Match | `/dashboard/match` | 等待揭晓、未匹配、结果展示、联系方式、受限结果、举报等现有场景 |
| 全站 / 用户中心 | `/dashboard/match/history`、`/dashboard/coupons`、`/dashboard/referrals` | 历史 / 空历史、可用 / 过期 / 已核销券、核销码弹窗、优惠券加载失败 |
| Dashboard / Referrals | `/dashboard/referrals` | 普通邮箱、学校邮箱邀请额度充足 / 部分使用 / 用完、有邀请记录、邀请码未生成 |
| 全站 / 运营后台 | `/admin`、`/admin/users`、`/admin/schools`、`/admin/questionnaire`、`/admin/cycles`、`/admin/reports`、`/admin/audit` | 登录门禁、运营概览、列表 / 空数据 / 失败、用户详情、学校编辑、问卷与轮次、举报、审计 |
| 全站 / 运营后台 | `/admin/analytics`、`/admin/merchants`、`/admin/campaigns`、`/admin/promotion` | 图表 / 加载失败、商家账号展开、券模板展开、推广概览 / 排行榜 / 券对账 |
| 全站 / 商家核销 | `/merchant/login`、`/merchant/redeem`、`/r/[code]` | 登录、手动输入、确认金额、核销成功、验证码过期、扫码缺少令牌、扫码确认 / 成功、赠品、服务失败 |
| 全站 / 公开页面、用户中心 | `not-found`、`error`、`global-error`、Dashboard `loading` | 找不到页面、可重试错误、全局错误、骨架屏；另通过 iframe 展示真实 `public/offline.html` |
| 全站 / 共享组件 | 品牌、图标、插画、公告、学校搜索、二维码、日期 / 数值选择器、账号菜单、注销弹窗、图表 | 保留正式组件行为；注销弹窗不提交真实注销 |
| 保留组件 / 已退出当前路由 | 旧账号设置、名片编辑、日程 / 倒计时、见面协商 | 仅用于旧组件检查，不表示当前产品入口或规则 |

基础 Button、Card、Field、Input、FormMessage、模式卡、匹配状态卡、Toast、反馈与举报等既有 Stories 保留。

## 跳转与无界面代码

- `/faq` → `/#faq`
- `/dashboard/history` → `/dashboard/match`
- `/dashboard/intent`、`/dashboard/me`、`/dashboard/settings` → `/dashboard`
- `/dashboard/me/card` → `/dashboard/profile`
- `/dashboard/meetup/start`、`/dashboard/meetup/[sessionId]` → `/dashboard/match`

`ServiceWorkerRegistrar` 没有可见 UI，且在 Storybook 挂载生产 Service Worker 会干扰 MSW，因此显式排除。离线 HTML 已覆盖，真实 Service Worker 注册与服务器鉴权属于正式应用集成验证。

首页、更新页、邀请落地页与全局错误页抽出了正式使用的视图组件。服务器取数、重定向、邀请归因和错误上报仍在原入口中执行；Storybook 使用相同视图呈现。邀请接受后的真实跳转、登录后的整页导航、服务端权限与持久化不由这些 UI Stories 证明。

## 检查方式

```sh
npm run audit:storybook:web
npm run typecheck:storybook:web
npm run build-storybook:web
npm run test:storybook:web -- --run
npm run screenshots:storybook:web
```

- `audit:storybook:web` 扫描页面、布局、系统状态与 TSX 组件的 Story 导入关系，未接入的新文件或失效豁免会使检查失败。当前 47 个路由 / 布局 / 系统状态入口、82 个组件文件均有接入关系，1 个无界面注册器明确豁免。这是静态接入检查，不能替代条件分支和视觉验收。
- 新增独立的 Storybook TypeScript 检查，包含 Stories、模拟数据与配置；不再只依赖会排除 Stories 的正式站 typecheck。
- 全站场景使用稳定的 `site-*` ID，保留中文分组名称。`fullSite` 场景在挂载前清理 Storybook 自身的本地状态，固定时间，避免邀请码、公告和已读状态污染下一场景。
- 修复 `path-to-regexp` 的全局版本覆盖：MSW 使用其声明兼容的 6.3.0，Nest / Express 继续使用原有 8.4.2。没有修改业务接口或放行未知请求。
- 截图脚本在 `play` 完成并且字体加载完成后回到页面顶部截图，避免固定导航出现在长截图中部；打开的弹窗按当前视口截图。检测整页横向溢出，文件名增加哈希以避免同名场景覆盖。定向补拍可用 `STORYBOOK_SCREENSHOT_APPEND=1` 配合 `STORYBOOK_SCREENSHOT_STORIES`，保留 manifest 中其他已验收状态。
- `Visual QA / Dashboard / Match / Responsive Matrix` 是内嵌多个已有 Stories 的汇总面板，不重复作为独立 smoke 测试；各被嵌入状态直接运行与截图。

## 验收记录

- Storybook 静态构建、专用类型检查和正式站生产构建通过；本机 3000 服务已使用新构建恢复，原登录与报名状态经浏览器确认保留。
- 157 个 Chromium 场景通过，覆盖 22 个 Story 文件；1 个响应式汇总面板按上文规则不重复运行。
- Web 单元测试 84 项通过。邀请链接测试改为检查真实视图的渲染结果，继续确认无效邀请指向注册方式选择页。
- Web 类型检查通过；Web lint 无错误，生成的、被 Git 忽略的 `mockServiceWorker.js` 存在一条无效 eslint-disable 提示。
- 桌面 1280×720 / 手机 390×844 共 314 张截图通过检查，157 个场景各覆盖两种尺寸，整页横向溢出为 0。资料量表选项、固定导航和弹窗经过定向补拍；长页面使用全页图，弹窗使用视口图。

本地证据保存在 Git 忽略的 `artifacts/autumn-2026/`：`storybook-full-test.log`、`storybook-typecheck.log`、`storybook-build.log`、`storybook-web-unit.log`、`storybook-web-typecheck.log`、`storybook-web-build.log`、`storybook-dashboard-recheck.log`、`storybook-public-recheck.log`、`storybook-coverage.json` 与 `storybook-full-site/manifest.json`。截图构建产物、运行日志与本机服务文件不提交。

本机持久预览仍由当前登录会话的 launchd 管理，Storybook 地址为 `http://localhost:6006`。本机静态服务已关闭缓存，避免重建后浏览器沿用旧 `index.json`。正式站地址仍为 `http://localhost:3000`。
