---
kind: changelog
lang: zh
---

# Issue #159：固定回归与隔离负载演练

> 文档归属：[验收记录](README.md)。需求：[Issue #159](https://github.com/LiLink-Campus/LiLink/issues/159)。

## 证据边界与复现

基准为 `1cfa67698946c973b5cc0d0a442065ce3aa2e8ac`，实施前工作区干净。在线 Ruleset 15300191 要求 `API unit and e2e tests`、`Storybook smoke tests and screenshots`；本次保留这两个真实 Job 名，不修改线上规则或生产权限。最终候选 SHA、Actions 结果及耗时见交付 PR；本记录中的实施期定向运行不替代最终提交的完整验收。

在 Node 24、npm 11、Git 2.54+、Docker 环境运行 `npm ci`、`npx playwright install --with-deps chromium`、`npm run test:ci`。Linux core 固定镜像安装 Chromium/WebKit，Storybook 使用 Chromium。所有数据库由任务创建；E2E 配置拒绝非 loopback、默认 5432、非 e2e role、非任务数据库名以及 URL query/hash，并且不读取宿主 dotenv。历史升级库在首次 CREATE DATABASE 前独立检查同一边界。

原生报告位于 `artifacts/e2e-linux-results/<id>/` 和 `artifacts/storybook-results.json`。迁移、最终业务状态、失败截图/Trace、子进程日志按现有 runner 输出；涉及登录凭据的场景不上传浏览器认证 Trace。手动负载执行 `node scripts/release/local-rehearsal.mjs`；加 `--api-load` 才额外执行内部 k6，工件位于 `artifacts/release-output/<id>/`。这些目录被 Git 忽略，Actions 上传的脱敏工件与本记录共同提供可核查证据。

## 固定执行结构

`test:ci` 固定顺序运行 core 和 stories；Actions 的两个 Job 调用相同两个 package 命令。PR 和 main push 相同，普通分支 push 不再重复触发。没有路径风险选择器、快慢 Profile、每日回归、报告协调平台或自动发布系统。

Core 一次构建 API；普通浏览器和 Sentry 各构建 Web 一次。Sentry Replay 使用隐藏 iframe 的原生计时器，实测干扰 Playwright fake clock，因此保留独立编译环境。普通 API 集成与浏览器使用同一 PostgreSQL 服务中的两个隔离数据库；Sentry 另用自己的库。三次主迁移、两个浏览器 seed，另保留历史 schema 专属完整迁移链。Shared 在 core/stories 两个隔离 Job 各构建一次，不为凑“一次构建”跨环境共享产物。

Shell 传播非零状态；Jest/Vitest/Playwright 原生报告检查非空、无必要 skip/todo、无失败或 flaky；禁止 only。Node TAP 的 skipped/todo/cancelled 也失败。取消传播为非零，并关闭代理在途请求、终止子进程、删除当次容器和数据库。没有自定义测试清单数据库。

## 实际资产变化

统计排除 prototypes、生成文件和二进制图片；包括各框架测试、Story、测试工具自身的行为测试。按基准与候选文件内容和AST声明计数，移动/改名/转为gallery不算代码删除。`git diff --numstat --no-renames 1cfa676` 可复核实际增删。

| 类别 | 文件数 | 行数前→后 | 新增 / 删除 / 净变化 |
| --- | --- | --- | --- |
| 测试和Story | 228→209 | 45212→43993 | +4411 / -5630 / **-1219** |
| Fixture/runner/config/辅助 | 38→33 | 3374→2548 | +279 / -1105 / **-826** |
| 日常CI Workflow | 5→1 | 508→57 | +33 / -484 / **-451** |
| 手动演练含其Workflow | 15→10 | 998→724 | +243 / -517 / **-274** |

测试旧路径移除24、新增5、净少19；其中20个旧文件的独有责任被合并/迁往keeper，4个退役，不将整文件行数都算成删除的行为。声明1070→1037；Story exports313→238。浏览器40→24文件、127→106声明；普通153+SDK3个固定实例，其中5个纯HTTP用例不启动浏览器。Story216行为用例，普通通过不保存截图；保留2个真实像素基准。退役产品组件/CSS/名称数据另减1539行，不混入测试减少。

## 核心不变量承接

| 责任 | 保留的具体边界 |
| --- | --- |
| 鉴权、会话、隔离 | `auth.spec.ts` 两种注册、Mailpit 真链接、登录/登出、重设密码撤销另一会话；`http-contracts.spec.ts` HTTP 身份矩阵；`contact-navigation` 同邮箱不同 userId 草稿隔离；coupon 401/403 清空可见旧数据。 |
| 资料保存与恢复 | `profile` 在途编辑、光标、最新权威值、刷新；`profile-recovery` 超时/丢ACK/真实导航；contact 真 PG CAS；`questionnaire-contract` PG trigger 故障回滚 nickname/draft/signature，再次保存成功。 |
| 报名、周期与撮合 | `matching` 加入/退出/过期拒绝；admin UI 周期状态；API matching-priority/batch/weekly 真实事务；Shared exhaustive oracle、双向硬约束与优先级。 |
| 揭晓与通知 | `admin-matching-lifecycle` 实际双方结果、快照、Mailpit、重放无重复；API reveal rollback 不残留 outbox/公开联系方式；mail-outbox 恢复。 |
| VIP | 真兑换、权益持久化、续期/到期/撤销；Profile/Center 独立消费的迟到响应、401、503、取消/timeout；免费学校复选框点击和关闭弹窗后仍未选中。 |
| 缓存 | 六种真实业务写入自动唤醒；真实 Next 发布/HTML/RSC、旧ACK、429、SIGSTOP；API PG 锁与取消、CAS、租约、五次预算/degraded、故障移除自动恢复、真实子进程 crash。 |
| 历史升级 | `historical-upgrade` 52 个真实 migration：旧 schema 合成账号/归档/密码状态/历史配对/联系方式/优惠券/激活/已发邮件/事件保全，第二次部署无待迁移；独有历史反例保留原 API 集成。 |

## 逐文件处置摘要

下面记录一次性删除依据；不作为以后动态选择测试的配置。Issue 中尚无等价承接证据的候选保留最小有效形式。

| 原浏览器文件（省略 `.spec.ts`） | 最终责任 |
| --- | --- |
| auth | 保留注册/会话真链，合并 handler/logout；接回学校超时重试和邀请参数。 |
| profile | 合并保存/reload/back，独有光标/迟到写/权重未确认保留；SQL 迁移下沉 API。 |
| profile-boundaries、profile-choice-rules | 删除文件；profile + ProfilePremiumLocked/Lifestyle + 真 PG 历史迁移承接。 |
| profile-confirmation-timeout、profile-reader | 删除文件；profile-recovery 保留丢ACK权威恢复与VIP撤销时真实导航；组件目录/动画取消归Story。 |
| profile-mobile | 留320/879/880真实断点、短屏、overflow/hit-test。 |
| contact-navigation | 保存失败→reload草稿→重试→导航合链；跨账号隔离与坏响应恢复独立。 |
| matching、admin-matching-lifecycle | 报名退出与真实prepare/reveal/双方结果合并重复setup，保留独立业务阶段。 |
| admin、weekly-cycles | 删除文件；admin-operations/lifecycle 承接 UI 状态与GET/PUT/DELETE身份边界。 |
| admin-operations、admin-users-workflow | 删除重复宽度/成功截图；晚到detail/write/post-write三个刺激仍保留。 |
| vip、vip-refresh | 合为vip；重复错误对话框归Story；真实权益、两消费者401/503/取消/timeout及null SSR仍独立。 |
| private-read-auth、performance-contracts | 删除文件；coupon清空/分页/旧poll、HTTP预算、VIP transient keeper承接。 |
| private-contracts | 保留真实SSR坏JSON与兼容字段；contact/UI恢复迁往实际owner。 |
| navigation-performance、read-refresh | 删除文件；profile-recovery保留pending save/no-answer-write/estimate恢复，学校/admin/trend交互归具名Story。 |
| community | 删除文件；auth学校合同，native-navigation保留hidden/resume无poll。 |
| home-cache-stability | 缓存发布唯一浏览器owner，保留真实PG事务、HTML/RSC、SIGSTOP、429及租约恢复。 |
| isr-write-budget、public-cache-publication、public-home-projection | 删除文件及420行collector；最小哈希/mtime + 真dispatcher/new process承接，不保留100轮重复读。 |
| public-cache-active | 六真实业务提交自动唤醒仍在，删除每种重复Next读取/渲染。 |
| public-cache-idle | 删除75分钟墙钟场景；API短真实PG周期与默认JS边界承接部分保证，丢失边界见下文。 |
| public-entry-links | 六origin组合归纯HTTP/PG/Mailpit；真实收到链接点击仍由auth执行。 |
| updates-feed | 保留items分页/文章/back与真实上游失败；去storage×mode×engine积和多次编译。 |
| home-native-navigation、loading-performance | 删除后者；代表路由保留JS禁用/失败、受控延迟、真实WebKit details，资源合同迁入artwork。 |
| home-artwork-preload | cold/warm/back、404与坏图、字体布局、atlas crop/单请求保留。 |
| intent-prefetch | 四种pointer/keyboard/touch/immediate刺激无等价承接，均保留；取消重复矩阵与空等。 |
| vercel-assets | 实际头像373/413/640/641/900布局接回，删除Node自启浏览器测试。 |
| pwa、pwa-origin-failure | 合文件，不混淆真实origin断开与浏览器offline。 |
| school-logo-background | 保留28名称/资源完整性，两个代表multiply/白边像素断言及WebKit；不再给26图分别作像素比较。 |
| sentry-cache-tracing | 独立真实SDK编译：同投影HTML/RSC重生稳定、真实独立trace、merchant隔离、error/Replay。 |
| visual | 保留Linux Chromium login/VIP弹窗两个真实像素基准；删30个冗余OS/engine/共享壳PNG。 |

Storybook 35→32文件、313→238 exports；216个固定行为用例，开发gallery不进入CI。删除不可达 PhoneCountryPicker、MatchWaitingStrip 及CSS/名称表；保留开发展示，无静态build/全量smoke/批量截图上传。逐项承接以可失败DOM/布局为准：PWA提示状态机；HomeOverview受控5秒边界/暂停/恢复/清理；Match/History隐私与长内容；Contact全部CAS/迟到/跨账号；referrals合状态factory；VIP保留各错误及结果factory；Auth合合法条款返回链；Admin保留编辑器/错误/晚响应并补独立CyclesTrendRetry；Profile保留阅读器中断/恢复/目录；Campaign保留冲突前后状态；Merchant合手工/扫码成功但保留不同入口；RegistrationSchool保留共享pending/搜索/失败重试；WeeklyChart六种数据语义均保留。四个纯gallery文件没有必要测试，不将其排除算作代码删除。

API 删除16个重复unit声明：draft相同昵称、四节点评分、name-collection注册Mock、contact CAS Mock、mail退休状态Mock、API重复Shared硬约束、admin预览时间Mock等由真实HTTP/PG或Shared独有反例承接。删除admin Proxy/WeakMap/Reflect聚合fixture，cycles改为显式owner组合，改名不算全删。admin/controller转发测试没有全路由HTTP等价证据，保留。新增真实历史链/事务/注册最后名额并发/短时PG恢复，因此API lane总体不是净删除；不拆大文件充数。

## 受控故障与首失败

| 验证 | 实际观察 |
| --- | --- |
| Shared height rejection false→true | `areHardMatchAnswersCompatible checks both directions` 业务断言失败；字节恢复/重建后21条通过。 |
| 默认retry60000→59999 | exact nextRecoveryAt 期望1860025、实际1860024，非启动错误；恢复后通过。 |
| LIMITED guard→VISIBLE | Match Story 缺少限制可见性标题，实际业务DOM失败；恢复后完整216条通过。 |
| contact key userId→email | 独立副本恢复了旧WECHAT草稿，预期邮箱radio checked却unchecked；恢复后同例552ms通过，后续51条通过。 |
| PG draft/signature、reveal中途故障 | 数据与昵称原子回滚，不残留outbox/公开联系，解除故障后保存/揭晓成功。 |
| API非完整选集 | 两条通过、八条skipped时runner明确exit1并清理（d07c6cee3e83）。 |
| Playwright空选集 | No tests found、exit1并清理（985dcf0af287），不算业务故障检出。 |
| 代理在途取消 | 真实HTTP黑洞使旧close超过2s失败；修复后2ms退出，原有15s请求deadline不变。 |

实施期失败保留：fixture旧聚合owner/TDZ、历史schema相对路径、问卷fixture含非法key均已定位修正并重跑；Story合并后的ACTIVE filter/accessible name/动画中间态、factory标签静态展开漏选已修正，206条的早期绿灯未当作完整216条；浏览器注册只读邀请码/可见VIP expiry断言已修正。首个GitHub候选09658b3的CI因数据库guard误挂到unit共享setup失败（[37841513186](https://github.com/LiLink-Campus/LiLink/actions/runs/37841513186)），Story216通过；guard已独立挂在E2E的第一setup，unit624及真实注册PG9条重新通过，未绕过隔离检查。全套入口初期暴露Git中文路径转义、遗漏`.env.example`、API格式检查，已修复。两次npm `ECONNRESET` 为依赖下载失败，不能记业务通过，也未提高重试次数。首次k6 JWT缺少sessionVersion造成401，修正真实合成会话并在发压前检查身份。

取消集成 c81127b04976：暂停真实API（SIGSTOP），保持代理请求pending，再SIGTERM runner；exit130、3.558s、零当次容器、工作目录删除。API Jest启动文件也拒绝非任务工作目录、本地dotenv和无效目标，在任何数据库client导入之前失败；实际配置子进程探针先复现缺少拒绝，再修复并4/4通过。

## 历史成本与取消的保证

旧样本来自Issue及实际Actions Job时间：CI [37732431730](https://github.com/LiLink-Campus/LiLink/actions/runs/37732431730) 墙钟12m45s/Runner17m13s；Browser [37732431787](https://github.com/LiLink-Campus/LiLink/actions/runs/37732431787) 21m54s/48m07s；Background [37732431747](https://github.com/LiLink-Campus/LiLink/actions/runs/37732431747) 73m07s/125m21s。该PR不含后台66m26s Runner，含后台191m47s，加重复push209m09s。旧至少9次Web、10次API、11次主migration、8次browser runner；旧Story完整样本14m28s/312用例/624张图，其中截图697s。Runner分钟为Job时间求和，不是账单。

旧faults571.061s与实施期39.282s为不同职责/环境的单次样本；scheduling真实进程约18秒仍保留。新短周期使用真实Date、PG NOW、socket、10秒网络/锁deadline；仅JS scheduler的默认60/120/240/300/900秒边界用fake timer。真实PG短静默与2秒自动poll、历史资格时间戳/近到期lease不得描述为数据库fake time。

明确不再保证：真实默认300秒claim连续寿命、43分钟默认退避/probe整段、超过5分钟真idle静默、15分钟多进程对齐、长时timer漂移、Neon缩容或账单。Story默认5秒autoplay的OS抖动也不由fake时间证明。移动Chromium通用矩阵取消；保留定向mobile-WebKit/WebKit，不宣称被移除引擎的旧flaky已修复。

旧 [37729513269](https://github.com/LiLink-Campus/LiLink/actions/runs/37729513269) cache稳定/发布四失败对应真实新owner的SQL/Next发布/SIGSTOP/预算检查；[37663519271](https://github.com/LiLink-Campus/LiLink/actions/runs/37663519271) mobile-Chromium事务通知flaky保留事务责任但取消该重复引擎实例；[37741065008](https://github.com/LiLink-Campus/LiLink/actions/runs/37741065008) 首次updates取消保留items/真实失败职责。新集合通过不证明旧SHA或已删除矩阵的历史失败已修复；不据这些少量样本报告总体Flaky Rate或P95。

## 手动演练与规则切换

演练删除Tunnel/公网代理/Caddy/远控接口/110分钟空转/pg运行时包装/镜像tar。生产镜像真实入口负责migration，临时Docker PostgreSQL迁移前验证任务标签、role、数据库名与空schema；随机密钥只挂载单文件给UID1001，宿主目录0700，结束删除。2000人表示撮合数据规模；k6单独33业务迭代/秒120秒，报告真实业务延迟和错误。API2CPU/3584MiB、pool20、正常后台调度、mail batch500，不能当成默认batch50送达时间。

实施期2000人已完成撮合/揭晓/2000快照与Mailpit恰2000通知；旧JWT的k6阶段失败，所以该整轮未记成功。受控启动后失败f8d14c6d7d94：镜像124.943s、migration/readiness6.619s、总132.829s、exit1且容器/网络/凭据清理通过。当前候选（未提交源码快照）ba96d8d47434 全流程 exit0、cleanupPassed：总428.000s，build125.068s，migration/readiness6.647s，seed1.943s，撮合9.952s、揭晓0.758s、通知排空161.624s，k6阶段120.311s。k6实际3961迭代、5150请求（含1次身份setup），零业务/HTTP失败、零dropped；读P95 10.056ms、写P95 11.431ms仅代表此120秒样本。146个Docker/PG资源样本覆盖真实负载。硬约束合成集合改成双向异性，不能将9.952s与旧“所有性别兼容”样本直接算提速。最终精确提交复验由PR补充。生产演练取消探针 df156503ddb9 在撮合/揭晓后等待通知时SIGTERM，3.455s内exit130，容器/网络/凭据清理通过。没有访问生产或用户开发数据库。

当前无需在线Ruleset迁移：两个旧名称对应真实固定Job，删除旧workflow没有删除被要求的context。若管理员以后改名：先让新名真实Job在PR产生通过/业务失败/取消结果；添加新required context并确认旧保护仍在；再移除旧context，最后删除临时旧名Job；失败可恢复旧context与上一个workflow提交。不在本PR静默执行权限修改。仍需仓库要求的一次人工review，PR不会自动合并。
