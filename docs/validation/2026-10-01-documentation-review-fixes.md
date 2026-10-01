---
kind: changelog
lang: zh
---

# 文档自动检查与原型隔离修复

> 文档归属：[验收记录](README.md)。

## 修复边界与验收条件

本次修复 2026-10-01 未提交改动 review 中的两项问题。文档门禁使用锁定 Seiso 和公开 Git 文件集；历史工件保留为注明本地范围的路径，私有资料不进入公开导航。原型验收自行创建无环境文件的源码副本、随机 loopback 端口和浏览器上下文；网页服务器的 fetch 单独拦截、记录并作为失败条件，浏览器网络继续独立检查。

编码前列出的失败方式与边界：

- 本机忽略文件存在掩盖断链：仅复制 Git 交付文件后，文档检查仍须通过；公开 Markdown 链接指向忽略文件时，本机检查也必须失败。
- 普通文档断链：Seiso 稳定规则仍须失败，不缩小现有公开检查范围来掩盖问题。
- SSR 漏检：原有原型会尝试 GET /v1/public/landing；服务端拦截应在修复前使验收失败，修复后请求数为零。
- 既有开发服务污染：验收使用自己的随机端口，不连接已有 4000 API、不继承凭据或环境文件，不需要业务数据库。
- 历史源文件失去依据：只有必要的预览读取边界适配；保留原始 Git 提交与源哈希，记录适配原因及目标哈希。
- 行为或清理回归：注册、登录、来信及四种状态在 Chromium/WebKit 桌面与移动视口仍须通过；异常退出只回收本次子进程和源码副本，报告保留失败原因。

## 结果与重跑

预览适配只修改 public-server-api.ts 与 devlog-feed.ts：前者保持首页统计不可用的预览反馈并复用合成学校，后者返回空更新日志。二者仅在开发 VISUAL_PREVIEW 开启时生效，避免预览读取已有 API 或真实更新日志站点。原始 sourceCommit、sourceSha256 和 sourceBytes 保留在 prototypes/migration-sha256.json；目标哈希记录适配版本，docs:verify 同时核对原稿 Git 对象和当前文件。

服务端 guard 阻止全部 fetch 出站；Next 开发服务器查询 npm 的精确 dist-tags URL 属于框架版本检查，单独记录为已阻止的框架请求。其他请求一律使验收失败，不接受宽泛域名豁免。

### 执行环境与前提

本机 macOS，Node v24.20.0、npm 11.19.0、Git 2.55.0、Seiso 0.3.0。文档检查需要完整 Git 历史和锁定依赖；原型还需要 Playwright Chromium/WebKit。隔离文件集验证复用了本机已安装的锁定依赖，未重新执行 Linux `npm ci`。全部数据为合成 Markdown 与已有视觉预览 fixture，不需要业务数据库、真实账户、邮件或支付。

重跑文档与原型验收：

```bash
npm ci
npx playwright install chromium webkit
npm run docs:check
npm run docs:verify
npm run docs:prototype:verify
npm run hooks:audit
npm run test:hooks
```

本次断链注入验收脚本保留在本机工件中，前提为上述依赖、完整 Git 历史及两个工件脚本都仍存在；它只修改自己的临时公开文件副本和副本 Git hook 配置，结束后恢复注入内容：

```bash
node artifacts/docs-review-fixes-20261001/check-document-guards.mjs
```

该脚本调用 artifacts/docs-review-20261001/reproduce-clean-checkout.mjs，仅复制 Git 跟踪文件与未被忽略的新文件，排除本机私有资料、依赖与历史工件，再运行文档验收。工件均受 Git 忽略；上述临时副本供现场检查保留，浏览器服务与源码副本由原型验收命令自动回收。

### 断言结果与证据

| 检查 | 实际结果 | 本机工件 |
| --- | --- | --- |
| Seiso 与文档完整验收 | 126 篇全部可达，稳定规则和预览诊断均为 0；公开交付文件集副本也通过 | artifacts/docs-verification/report.json；artifacts/docs-review-20261001/reproduced-clean-checkout/report.json |
| 公开链接边界 | 修复前 38 个目标不在公开交付范围，修复后为 0；保留历史工件路径说明，删除私有导航，修正越界相对链接 | artifacts/docs-review-fixes-20261001/public-links-before.json；artifacts/docs-verification/public-links.json |
| 提交 hook 的真实行为 | 正常文件集通过；实际存在但被忽略的文件、带锚点的忽略文件、普通断链均阻止 hook，共 4 项通过 | artifacts/docs-review-fixes-20261001/document-guards.json |
| Git hook 配置与既有检查 | 已安装配置审计通过，既有 13 项测试通过 | `npm run hooks:audit`、`npm run test:hooks` 的执行结果 |
| 原型真实页面 | Chromium 148.0.7778.96 与 WebKit 26.4，在 1440×900、390×844 四组通过，共 44 条记录断言、24 张带哈希截图 | artifacts/docs-prototype-verification/report.json |
| 服务端请求隔离 | 修复前页面行为通过但服务端业务请求使总验收失败；修复后守卫已加载，业务 fetch 尝试为 0，1 次框架版本检查被阻止 | artifacts/docs-review-fixes-20261001/prototype-before/report.json；artifacts/docs-prototype-verification/server-fetch.jsonl |
| 原型素材与来源 | 404 项目标哈希通过，其中 2 项适配同时核对原始 Git 源码哈希；其余 402 项保持迁移原稿 | artifacts/docs-verification/assets.json；prototypes/migration-sha256.json |

人工抽查了 Chromium 桌面首页、WebKit 移动首页和注册截图，首页保留“平台数据暂时不可用”反馈，页面与注册表单没有水平溢出。Codex 内置浏览器返回 `Browser is not available: iab`，因此没有内置浏览器验收；实际引擎与视口以上述隔离 Playwright 结果为准。

### 自动化接入与验证边界

Seiso 已固定依赖并接入 `docs:check`、Git pre-commit/pre-push 及 Documentation workflow；后者在 GitHub push、pull_request 和手动触发时运行 `docs:verify`，保存验收工件。稳定规则失败或公开链接越界会返回非零状态。预览规则继续提供人工审阅线索；业务事实准确性仍需对照当前代码与运行态核验。

本次尚未 commit 或 push，远端 CI 未触发，也未核验分支保护是否要求该检查。原型已有退休 analytics 导入警告与 WebKit 日期格式差异继续由 DOCS-PROTOTYPE-01/02 跟踪；本次通过不代表正式站点业务验收或所有截图的人工视觉审阅。
