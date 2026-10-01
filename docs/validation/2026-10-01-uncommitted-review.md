---
kind: changelog
lang: zh
---

# 未提交文档重整的独立审查与修复

> 文档归属：[验收记录](README.md)。
> 日期：2026-10-01；基线：a4f91a47；范围：文档迁移、原型搬迁、文档工具链和 Git hooks。

## 审查与修复

三项独立审查分别核对工具链故障行为、现行契约与源码、历史内容及素材迁移；整合审查检查 Git 状态、忽略规则、CI、实际提交门禁和原型可见结果。

| 问题 | 修复及依据 |
| --- | --- |
| 工作树公开链接可经符号链接落到 Git 忽略的私有文件 | [公开链接审计](../../scripts/docs/public-links.mjs) 对包括锚点在内的内部链接同时核对物理目标与公开 Git 文件集合；私有和越界目标拒绝，内部公开目标允许 |
| 原型普通条目仅比对可编辑清单，改写目标与清单可一起通过 | [素材校验](../../scripts/docs/assets.mjs) 对全部条目读取固定提交的原始 Git blob；适配条目另核对原稿哈希、大小和验收记录 |
| 空迁移清单可获得通过结果 | 素材校验拒绝空清单、无效来源、重复或越界条目，并要求目标及适配记录为普通文件 |
| Seiso 异常可能留下上次成功报告 | [文档验收](../../scripts/docs/verify.mjs) 每次初始化失败状态，清除本次输出目录，异常覆盖失败报告；子进程增加时限 |
| 本地仿真指南写错学校来源，遗漏空库初始化且混淆首次与重跑 | [仿真指南](../guides/community-simulation.md) 按 seed 脚本明确既有学校目录、迁移前提、固定样本归属和重跑边界 |
| 现行说明遗漏部分报名、缓存、配置和演练限制 | 对照源码补齐当前问卷版本与草稿门槛、hash 图片缓存、管理员初始化、演练固定文件及提交前提；区分 API/Web 的 Sentry 上传配置和已交 SMTP 邮件的不可撤回边界 |

新增 [工具链行为验收](../../scripts/docs/verify-tooling.mjs) 先声明故障预期，再通过真实 CLI 验证允许、拒绝和本次报告。Documentation workflow 执行该验收并保存工件。正式应用业务代码没有修改。

## 环境与重跑

本机 macOS，Node v24.20.0、npm 11.19.0、Git 2.55.0、Seiso 0.3.0。需要完整 Git 历史、锁定依赖与隔离 Playwright Chromium/WebKit；文档及原型验收使用合成文件、合成页面 fixtures 和一次性上下文，无业务数据库、真实账号或邮件操作。

```sh
npm run docs:check
npm run docs:verify
npm run docs:tooling:verify
npm run docs:hooks:verify
npm run test:hooks
npm run hooks:audit
npm run docs:prototype:verify
```

## 断言与证据

| 验收 | 实际结果 | Git 忽略的本机工件 |
| --- | --- | --- |
| 文档稳定规则、预览、公开目标、导航、脚本与历史来源 | 全部通过，稳定及预览诊断为 0；完整范围由最新 report/index 记录 | artifacts/docs-verification/ |
| 新增工具链真实 CLI 故障场景 | 8/8 通过：私有/越界/公开符号链接、带锚点的私有符号链接、目标与清单共同改写、空清单、越界迁移目录、Seiso 异常覆盖旧成功 | artifacts/docs-tooling-verification/report.json 与逐场景日志 |
| 真实 pre-commit hooks 和暂存快照 | 17/17 通过，允许/拒绝、冲突、替代索引与源索引保真按行为断言 | artifacts/docs-hooks-verification/report.json 与逐场景日志 |
| 既有 hook 检查与本机安装 | 13/13 通过；四项配置与 registry 一致 | test:hooks、hooks:audit 实际输出 |
| 删除与素材迁移 | 451/451 删除项有目标；403 字节一致，48 文档重写或适配已审查；404 原型条目均匹配 Git 原稿与目标，2 项有记录适配；付费备份内部 9 项哈希一致 | artifacts/migration-review-20261001/report.json；artifacts/docs-verification/assets.json |
| 原型真实页面路径 | Chromium 148.0.7778.96 / WebKit 26.4，1440×900 / 390×844，4/4 组通过，44 项断言、24 张带哈希截图；服务端 fetch 守卫启用且无业务请求 | artifacts/docs-prototype-verification/report.json 与截图 |
| 内置浏览器视觉核查 | Codex In-app Browser 在桌面及移动检查未匹配、打开来信和成功结果；移动无横向溢出，任务服务及副本已回收 | artifacts/uncommitted-review-browser/visual.json、cleanup.json、iab-desktop-match.jpg、iab-mobile-match.jpg |

迁移明细的独立核验脚本保留在本机，可通过 `python3 artifacts/migration-review-20261001/audit-migration.py` 重跑；该本机辅助脚本不作为仓库交付依赖。普通原型来源和目标的持久校验已由 docs:verify 覆盖。

## 验证边界

指南修正通过当前源码、配置及脚本核对，未执行开发库 seed、专项远端演练或生产操作。原型验收验证搬迁与合成预览，不证明真实报名、送信、支付或匹配写入；WebKit 与移动视口不等于物理 iPhone 或用户个人 Safari。

历史原型的 shared analytics 兼容告警和日期差异保留在 [原型维护任务](../plans/open-questions.md#原型维护任务)，其冻结源码不覆盖今天的正式应用。推送触发的远端 CI 按最终提交单独报告，本机结果不能替代远端结果。
