---
kind: changelog
lang: zh
---

# 资料页、用户中心 VIP 读取与问卷阅读器验收

> 文档归属：[验收记录](README.md)。
> 效力：2026-10-06 的隔离本机记录；不能替代远端 CI、生产部署、费用账单或真实手机网络验收。

## 范围与设计

Issue #147 以 `b75ed0fdb76fff87bd611a4a9ba42e191c2cb0ae` 为实现前基线。资料页和用户中心共同使用 dashboard 局部 VIP hook；状态、错误、请求和定时器属于单个页面实例。账户模块只发布账户身份变化，不存储会员业务数据。bootstrap 对象身份与账户身份分别使旧读失效；同账户新 `null` bootstrap 也取消旧结果。旧内部 VIP hook 删除，两个调用方一次迁移。

前台每 30 秒最多一个在途读；隐藏时释放轮询、到期定时器和请求。恢复时先校准本地到期，再合并伴随 visibility/focus 事件；后续独立恢复仍可读取。资料页保留最近成功权益和错误，用户中心普通失败显示待刷新；真实当前 401 撤销旧权益，取消和过时响应不影响新生命周期。读取复用现有 fetchApi 截止时间和共享 `/me/vip` 运行期协议校验。

阅读器稳定选择集合与当前题块，只有真实变化时才写 `data-reader-hidden`。原表单 DOM、字段注册、目录、hash、自动保存和导航保持可见行为；新集合与快速跳转会取消旧动画和计时器。[VIP 当前契约](../reference/vip.md)与[账户当前契约](../reference/account.md)分别维护长期定义。

## 环境、数据与实施前失败

Node 24.20.0、npm 11.19.0、Playwright 1.60.0；隔离 runner 构建 production-mode Web/API，创建带专属 run 标签的 loopback PostgreSQL/Mailpit 和合成账户。每个 E2E 使用独立账户；不加载开发或生产数据库。身份、口令、验证码、Cookie 与问卷正文不进入验收摘要；新增 E2E 与测量工具的用户中心截图遮罩邮箱。

新增行为场景和测量门禁在实现前明确。基线 `artifacts/e2e/5c2f914d23e5` 的四个浏览器场景全部按预期失败：资料页快速恢复重复请求、用户中心隐藏继续轮询、两个页面 null bootstrap 不立即读取。相同实例的新 bootstrap、延迟成功/401/503、清错误、换号和退出再登录另外以实际 bootstrap 组件的浏览器 Storybook 场景隔离验证；基线 `artifacts/issue-147-red/lifecycle.json` 为 10/10 失败。后者是组件生命周期行为证据，不声称完整页面 E2E。

## 重跑命令与可观察断言

```sh
node scripts/e2e/run.mjs --contract-proxy vip-refresh.spec.ts profile-reader.spec.ts read-refresh.spec.ts profile.spec.ts profile-mobile.spec.ts vip.spec.ts private-contracts.spec.ts auth.spec.ts --project=chromium --project=mobile-chromium --project=webkit --project=mobile-webkit
npm run test:storybook:web -- --run apps/web/src/stories/vip-lifecycle.stories.tsx
npm run typecheck:web
npm run typecheck:storybook:web
npx tsc -p e2e/tsconfig.json --noEmit
npm run lint:web
npm run lint:shared
npm run build:shared
npm run test:shared
```

`--contract-proxy` 仅对该合成会话改变真实 SSR 上游 bootstrap；浏览器路由拦截模拟 VIP 读失败。人工 visibility 和加速时钟测试逻辑生命周期，不代表真实后台能耗。页面路径断言包括：有效 bootstrap 零启动重复读、未知 bootstrap 可见立即读/隐藏延后、失败不快速重试、取消旧 401、本地到期、503/非法协议/非法日期/超时/401 后恢复，以及中心与资料页不同错误呈现。

阅读器在普通动画和减少动画两种偏好下检查连续输入焦点和光标、自动保存、下一题/返回/刷新后的真实保存值、自动前进与快速目录跳转。动画断言定位当前题块自身，VIP 撤销先等待响应及界面权益更新，再检查旧动画已取消、单一可编辑题块和可见未开通提示；手工导航发生在取消断言之后。

浏览器测试保存脱敏截图、请求启动/取消账本和 Playwright JSON/HTML 报告，可从 runner 打印的工件目录重建。生命周期 Storybook 更新后为 `artifacts/issue-147-lifecycle.json` 的 10/10 通过。

| 实际运行 | 结果 | 解释 |
| --- | --- | --- |
| 广覆盖四引擎 `ae74b2285da0` | 300/308 通过 | 两个中心隐藏副本定位、五个 SSR 可见即人工 focus 的前提错误；一个既有学校注册在 hydration 前输入丢失 |
| VIP、reader、auth 四引擎 `8f60f4812023` | 139/144 通过 | VIP 80/80、auth 28/28；收紧后的 reader 五处定位/导航夹具错误 |
| 最终 reader 四引擎 `8e9d44d4cd61` | 24/24 通过 | 普通和减少动画、取消/权益界面已应用、保存/重载闭合 |
| 生命周期浏览器 Storybook | 10/10 通过 | 同实例 bootstrap、null→null、换号、退出再登录与晚到成功/401/503 |
| Shared 现有套件 | 110/110 通过 | 运行既有套件，没有新增单元测试 |
| Web、Storybook、E2E 类型检查；Web/Shared lint | 通过 | Web lint 仅五条既有警告 |
| 文档检查与验证 | 通过 | 154 文档，0 稳定诊断；历史性能页一条 preview 提示保留 |

`artifacts/issue-147-validation-summary.json` 按文件、行为标题和浏览器项目保留每项最后观察，308/308 通过。该结果组合广覆盖与夹具修正后的定向重跑，明确不称单轮零失败；三轮间产品源码一致。隐藏副本用 main 范围限定，中心人工事件在真实账号菜单可操作后触发，动画取消断言在手工导航前完成，未放宽业务结果。

额外运行的 `audit:storybook:web` 发现基线已有 `app/r/[code]/layout.tsx` 未覆盖；该文件本次未改，项目 GitHub Actions 不运行此 audit。这里如实记录该检查未通过，不扩展修复范围。

## 真实时间配对测量

测量门禁与局限先写入[dashboard 测量契约](../../scripts/performance/dashboard-contract.md)。同一合成账号在冻结基线和候选构建间交替采样；同一 disposable API、桌面 1280×800 / 手机 390×844、普通动画、隔离 Chromium、真实时间。输入反馈为可信 input 到下一帧保留控件值和焦点；切题为可信按钮点击到下一题可见。这两个自定义指标不等于 INP。

每视口至少十对完整样本；每轮 18 次输入的帧延时 p75 形成一个输入样本，再报告十轮样本的 p75，切题每轮为一次点击。以固定随机种子 2000 次 bootstrap 保留整轮配对，报告这两个样本指标 p75 差值的 95% 区间，不把同轮按键伪作独立样本。门槛为基线 p75 的 10% 与 20 ms 中较大值；缺样或区间无法排除门槛外回退为 INCONCLUSIVE，功能失败为 FAIL。长任务和属性写入仅作诊断。驻留另记录 31 秒前台、61 秒模拟隐藏、恢复后快速 focus 与后续独立恢复的实际请求启动、完成、取消与失败。

初次工具运行 `artifacts/performance/dashboard-147` 和诊断 `dashboard-147-probe` 均为 0 完整对的 FAIL，保留原始失败。诊断保存响应证明 before 首次保存 200，after 的输入回到同账号已经保存的终值；应用按 last-saved snapshot 正确去重，没有再次 PUT。采集前提修正为两侧先通过实际目录打开昵称，真实填写并保存统一准备值，再清空开始同一固定输入；准备过程在计时外，时间门禁保持原值。

后续 `dashboard-147-final` 保留十对桌面样本及两份完整驻留账本，但手机目录准备超时，整体仍为 FAIL，不作为正式通过结果。采集器在 DCL 后一次性检查尚未出现的手机目录按钮并跳过打开；按真实 E2E 的前提改为等待当前题目区域和手机目录后操作，并记录失败所在阶段。修正后的 `dashboard-147-mobile-probe` 一对无功能失败，样本不足仍为 INCONCLUSIVE，不删旧失败或混合工具版本样本。

`dashboard-147-complete` 的四份驻留完整；但输入集合每侧为 369 帧，包含九个准备阶段事件的下一帧回调。旧摘要原本为 PASS，因当时没有每轮 18 帧断言，该摘要的输入与切题性能不继续作通过证据。采集器增加显式采样开关和每轮精确 18 帧断言；最终 `dashboard-147-input-boundary` 仅重跑输入及切题二十对，驻留继续单独引用原完整账本，不混合两版本的输入样本。

最终输入采样时间为 13:26:00–13:27:37 UTC，Chromium 148.0.7778.96；二十对四十序列中两侧各 360 帧，下一帧值和焦点均保持，准备与测量的 80 次保存响应均为 200，功能失败为 0。以下单位为 ms，输入指标为每序列 18 帧 p75 的十轮 p75；所有区间包含 0，仅支持通过预先规定的 20 ms 不回退门槛，不支持确定提速。

| 视口、指标 | before p75 | after p75 | 配对差值 95% 区间 | 结果 |
| --- | ---: | ---: | --- | --- |
| 桌面输入 | 2.4 | 2.4 | [-0.2, 0.2] | PASS，10 对 |
| 桌面切题 | 7.0 | 7.3 | [-1.2, 1.1] | PASS，10 对 |
| 手机输入 | 3.3 | 4.1 | [-0.2, 1.5] | PASS，10 对 |
| 手机切题 | 7.3 | 8.4 | [-0.9, 1.4] | PASS，10 对 |

独立驻留采样为 13:11:57–13:19:51 UTC 的 `dashboard-147-complete`；每侧、每视口均完整观察 31 秒前台、61 秒模拟隐藏及两次恢复。finished 表示浏览器传输完成，不另推断状态码。

| 视口、版本 | started | finished | cancelled | failed | 隐藏阶段 started |
| --- | ---: | ---: | ---: | ---: | ---: |
| 桌面 before | 4 | 4 | 0 | 0 | 2 |
| 桌面 after | 3 | 3 | 0 | 0 | 0 |
| 手机 before | 4 | 4 | 0 | 0 | 2 |
| 手机 after | 3 | 3 | 0 | 0 | 0 |

两范围的候选冻结源码 SHA-256 同为 `ac58900528497d83bc3a82fd3dd7a3f998ea899108b3736bdb091f37b24d91d7`。输入工具 SHA-256 为 `446700410cceb70041e52e9ba584cdd356cb45ec28753b1c0e204667c68c521b`，驻留工具为 `925b00b1c586c722c7c97bec1aa53a6b546149a073676a7326e9b86af5bda1e1`。两者 raw 和 summary 独立保存，输入摘要重建后字节完全一致；长任务两侧皆 0、reader 属性写入 18368→40 仅作诊断，不作 CPU 或能耗门禁。

```sh
node scripts/e2e/run.mjs --serve --serve-minutes=90 --extra-client-origin=http://127.0.0.1:61082
node scripts/performance/serve-baseline.mjs artifacts/e2e/RUN/session.json 61082 b75ed0fdb76fff87bd611a4a9ba42e191c2cb0ae
node scripts/performance/dashboard-compare.mjs artifacts/performance/baseline-RUN/comparison-session.json artifacts/performance/dashboard-147
node scripts/performance/dashboard-compare.mjs --summarize artifacts/performance/dashboard-147/raw.json
node scripts/performance/dashboard-compare.mjs artifacts/performance/baseline-RUN/comparison-session.json artifacts/performance/dashboard-147-input-boundary --inputs-only
node scripts/performance/dashboard-compare.mjs --summarize artifacts/performance/dashboard-147-input-boundary/raw.json
```

工具先验证 canonical runner/comparison session、同 API 和未过期的 loopback 服务，再创建合成账号。候选摘要从已构建 runner 的冻结源码计算；工具摘要、实际浏览器版本、每帧结果、每对数值与请求事件保存在脱敏 raw JSON。浏览器请求减少不证明 SQL 被取消，也不证明生产 CPU、能耗或 Vercel 费用减少。

## 审查与交付边界

两名独立代理复核生命周期、账户隔离、协议校验和 reader；审查发现的测量隔离与动画断言缺口已收紧。远端 PR、精确提交 CI 和合并结果由主任务继续记录。

PR #149 首次提交 `eee9739f2f73389e4b933d394a871971aff39457` 的 [Storybook 工作流](https://github.com/LiLink-Campus/LiLink/actions/runs/37471385883) 为 311/312 通过，唯一失败为既有 `ProfileInterruptReaderRefresh`：未开通 `/me/vip` 夹具只有 active/expiresAt，严格协议拒绝它；同时 null bootstrap 的立即初读与随即人工 focus 会被正常去重，在 Storybook 固定 Date 下不会因真实等待而成为独立事件。该场景意图是已知未开通页面在阅读中变更权益，修正为带完整未开通 VIP 的 bootstrap，并复用带 `VipStatus` 类型的完整响应；保留其动画中刷新、取消和可见结果断言，不改变产品协议或去重门禁。

修正后以下整文件浏览器复验为 59/59 通过，包含原失败场景。JSON `artifacts/issue-147-storybook-fixture.json` 遮罩邮箱，保留逐行为结果；Web/Storybook 类型检查和 Web lint 重新通过，产品源码未变，两名独立代理复审夹具无阻断项。既有 dashboard 故事文件原为 953 行，本次最小夹具修正为 955 行；没有为单个前提扩展全套故事拆分。修正提交的完整 CI 待主任务继续记录。

```sh
npm run test:storybook:web -- --run apps/web/src/stories/dashboard-pages.stories.tsx --reporter=json --outputFile=artifacts/issue-147-storybook-fixture.json
```

主任务另用 Codex IAB 在 1280×800 和 390×844 实查两页。中心显示有效会员徽章及合成的 2099 到期时间；手机资料昵称和简介输入后显示草稿已自动保存，目录可跳到第二题，桌面目录、当前题块和保存反馈一致。四张本机截图及断言为 `artifacts/issue-147-review/iab/{acceptance.json,center-desktop.jpg,center-mobile.jpg,profile-desktop.jpg,profile-mobile.jpg}`。该范围是本地 IAB 定向视觉与操作证据；四引擎生命周期另按上述 E2E 记录。真实 iOS、大陆网络与生产账单仍 UNKNOWN。本次未部署。
