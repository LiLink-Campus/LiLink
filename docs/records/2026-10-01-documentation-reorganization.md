---
kind: changelog
lang: zh
---

# Seiso 文档重整实施与验收

> 文档归属：[实施记录](README.md)。
> 日期：2026-10-01；范围：本机文档、历史原型及维护门禁。

## 实施结果

整理前 Git 基线为 [a4f91a47](https://github.com/LiLink-Campus/LiLink/commit/a4f91a47cda9836e1d3f7c100d12fba12af4230c)；它作为历史对照，不是部署版本声明。

按逐篇清单归并现行指南、参考、决策、计划、记录、验收、归档和模板。业务解释的维护位置使用 canonical 标记；其他页引用对应参考。历史资料标明来源提交和效力，旧代码链接固定 Git 对象，删除重复段落前保留可追溯原稿。

独立交接目录的七份原件完整迁入 Git 忽略的 docs/private，原目录已移除。私有导航更新，原件字节未改。秋季可运行副本与付费前端备份移入 prototypes；设计与开发过程归入 docs。Docker 构建上下文排除 docs/prototypes。

清单记录 113 份原始 Markdown（104 份公开清单条目与 9 份私有原件/导航）；逐篇去向及新增文档职责见 [迁移表](2026-10-01-document-migration.md)。历史进程按 [Git 主线](project-history.md) 追溯，Git 收录、设计事件和生产部署分别判断。

## 核验依据

现行指南对照 package scripts、模块职责、生产入口、Compose 和配置；参考对照账户事务、匹配求解与资格、VIP 权益、券发放/核销和 snapshot 一致性。工作树中的应用实现保持原状。现场 DNS、主机、数据库 provider 和运行 SHA 未通过本次文档整理确认；未决产品意图见 [待确认事项](../plans/open-questions.md)。

Seiso 使用 package/lock 固定的 0.3.0；CLI 实测不接受 kind: agents，AGENTS 按 howto 检查。现行与历史分域比较重复，历史链接继续检查，preview 保持人工审阅。

## 重跑与工件

环境为 macOS、仓库锁定 Node/npm、完整 Git 历史和 npm ci 安装的依赖。文档检查不需要 API、数据库或真实账号。

```sh
npm run docs:check
npm run docs:verify
npm run docs:preview
npm run hooks:audit
npm run test:hooks
```

- artifacts/docs-verification/report.json：全部公开入口可达、分类父页面、八个事实维护页、npm 脚本、Git 历史目标、稳定规则和原型哈希断言。
- artifacts/docs-verification/index.json 与 policy.json：完整检查集、有效类型、比较域与规则。
- artifacts/docs-verification/stable.json / preview.json：诊断与统计；稳定从基线 22 条降至 0，preview 全规则诊断为 0，已人工审阅并去除历史计划/设计及分类入口的重复段落。
- artifacts/documentation-reorganization/：整理前文件、SHA-256、首次/最近收录提交、入链、450 项初始迁移映射与链接改写记录；发布演练 README 后续归并使文件映射为 451 项。临时 Git index 识别 447 项重命名，其中原型的 404 个非 Markdown 文件为原样重命名；真实暂存区保持不变。173 条已迁移历史引用均在其原稿来源提交的祖先范围内，Git 行锚点未越界。
- artifacts/docs-reorganization/handover-validation.json：私有原件七份哈希与大小一致、源目录消失、导航有效、Git 忽略且未跟踪。

根 README 的开始开发、运行测试、匹配规则、发布/回滚、追溯旧决策五条路径全部通过，125 份公开检查文档均可从根入口到达并具有类型归属；其中 26 份本次新增文档也纳入清单。Git pre-commit 实际调用通过；四项 hooks 已安装并 audit 一致，复用的 13 项 hook 检查通过。

## 原型行为验收

以下是重整时采用的首次验收流程；随后发现服务端请求隔离缺口，现行命令已改为自行启动和回收隔离副本，见 [后续修复与验收](../validation/2026-10-01-documentation-review-fixes.md)。

先在一个终端启动，再在另一个终端执行：

```sh
node prototypes/autumn-2026/start.mjs
npx playwright install chromium webkit
npm run docs:prototype:verify
```

启动器完成 shared 构建并在 loopback 3101 启动 Next.js 副本。预览使用既有开发 fixtures 和一次性浏览器上下文，注册/登录不创建真实账号，不发送真实验证码、不接入支付；验收不启动 API 或数据库。

Chromium 148.0.7778.96 与 WebKit 26.4 分别在 1440×900 和 390×844 验证注册、登录、打开来信、等待/成功/交换联系方式/未匹配状态和横向溢出：四组均通过，44 项断言、24 张带哈希截图，工件位于 artifacts/docs-prototype-verification。已视觉检查桌面来信、WebKit 移动来信与移动注册截图。

[迁移哈希](../../prototypes/migration-sha256.json) 包含 404 个源文件、配置与素材，逐项 SHA-256 和大小一致；它们保留原始实现，不根据今天的正式应用覆盖历史副本。付费版是恢复素材备份，不能作为独立 Next.js 应用启动。

## 已知边界

- 内置浏览器返回不可用，本次使用隔离 Playwright 引擎；移动视口和 WebKit 不代表物理 iPhone 验收。
- 原型保留 Vercel 统计组件；验收将 32 次外部脚本请求全部拦截，没有真实业务请求。公共首页统计在无 API 时呈不可用反馈，不构成业务统计验证。
- WebKit 的中文日期格式多一个空格，旧副本在等待状态出现一次 hydration mismatch/视口，随后恢复并通过可见状态断言。仅将该具体差异列为已知警告，其他 page error 会失败；源文件哈希证明未在迁移中改写。
- Next dev 输出旧 product-analytics 副本的缺失导出告警，例如 getProductEventDefinition 与 sanitizeProductEventEntityId；当前 shared 已退役相应定义。可见预览行为通过不等于无告警构建或生产构建通过，后续维护任务为 [DOCS-PROTOTYPE-01/02](../plans/open-questions.md#原型维护任务)。
- 验收不证明真实 API 写入、邮件送达、支付、生产容量或当前线上部署。远端 CI 尚未运行；本次没有 commit、push、merge 或部署。

后续按 [Seiso 维护入口](../guides/documentation.md) 处理变更；有日期的记录保存环境观察，现行页链接事实维护位置。
