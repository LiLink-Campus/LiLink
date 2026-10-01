# LiLink

校园里的，认真相遇。

LiLink 面向高校学生提供周期性 1v1 匹配。用户建立账号、完善资料和问卷、选择本轮参与意向，查看揭晓结果并决定是否建立联系。仓库包含用户网站、管理后台、商家核销入口、NestJS API 和共享领域包。

## 开始工作

从 [项目文档](docs/README.md) 进入对应任务：

| 任务 | 入口 |
| --- | --- |
| 开始开发 | [本地开发](docs/guides/local-development.md) |
| 运行测试 | [浏览器 E2E](docs/guides/browser-e2e.md) |
| 理解匹配规则 | [匹配与参与契约](docs/reference/matching.md) |
| 查找发布与回滚 | [生产发布](docs/guides/production-release.md) |
| 追溯开发与决策 | [Git 开发历史](docs/records/project-history.md) |
| 维护文档 | [Seiso 文档维护](docs/guides/documentation.md) |

安装依赖后，从仓库根目录运行 `npm run dev`。环境准备、数据库前提和命令说明统一由本地开发指南维护。工具链声明来源是 [package.json](package.json)、[.node-version](.node-version) 和 [.nvmrc](.nvmrc)。

## 协作与边界

Agent 规则维护在 [AGENTS.md](AGENTS.md)，补充规则位于 [API 工作区](apps/api/AGENTS.md) 和 [Web 工作区](apps/web/AGENTS.md)。功能是否已部署须依据对应环境的发布记录与运行证据；Git 提交、原型预览和本地验收分别记录。

文档通过 `npm run docs:check` 检查，通过 `npm run docs:verify` 验收导航与文档归属。私有原件与验收产物保持 Git 忽略。
