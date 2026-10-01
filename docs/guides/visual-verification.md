---
kind: howto
lang: zh
---

# UI 视觉验收

> 文档归属：[操作指南](README.md)。

范围、浏览器与合成数据要求由 [Web Agent 规则](../../apps/web/AGENTS.md) 维护。先列出受影响页面、视口和状态，再准备 Storybook fixtures 或隔离 E2E 服务。

1. `npm run build-storybook:web` 构建故事。
2. `npm run test:storybook:web -- --run` 执行相关交互，必要时按工具支持的文件参数限定范围。
3. `STORYBOOK_SCREENSHOT_STORIES='<id-or-title-substrings>' npm run screenshots:storybook:web` 捕获受影响故事；选择器仅限定截图范围。
4. 查看截图与实际页面，检查换行、宽度、溢出、图标、弹窗、展开状态、反馈和断点；共享组件覆盖受影响使用页。
5. 用 Codex in-app browser 查看桌面与移动布局，以隔离 Playwright WebKit 补充引擎兼容性。自动用户路径由 [浏览器 E2E](browser-e2e.md) 执行。

需要完整 smoke 检查时运行 `npm run visual:storybook:web`。报告实际浏览器/引擎、视口、状态与证据；移动视口或 WebKit 不证明物理 iPhone 验收。

## 留存与发布证据

截图与 `storybook-static` 留在 Git 忽略的工件目录，记录命令、环境、合成数据前提、断言及未验证项。视觉基准更新按 E2E 指南逐图审阅。

任务明确授权更新 PR 后，可使用 `npm run evidence:storybook:web -- --pr <number>`。该命令推送证据分支并更新 PR 评论；本机检查通过不自动授权发布证据。
