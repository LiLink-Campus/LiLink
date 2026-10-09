---
kind: howto
lang: zh
---

# 视觉与交互验证

> 文档归属：[操作指南](README.md)。

修改页面后在 Codex in-app browser 检查实际桌面和移动状态；隔离 Playwright WebKit 负责必要 Safari 引擎差异。报告实际引擎、视口与状态，模拟环境不代表物理 iPhone。个人 Chrome 仅在当前任务明确授权后使用。

Storybook 保留开发展示：`npm run storybook:web`。有独立交互、隐私、错误或布局断言的 Story 标记 `tags: ["test"]`，固定通过 `npm run test:ci:stories` 执行。不要求每个组件或 Story 进入 CI，不再静态构建、遍历 smoke 截图或上传批量成功图片。

真实像素比较使用 [浏览器 E2E](browser-e2e.md) 中的 `toHaveScreenshot`，固定 Linux renderer。DOM 布局/可见性断言、人工截图和像素比较是不同证据，不能互相冒充。运行 `npm run test:e2e:web:linux -- --grep @visual` 复核必要基准；有意变更时才显式使用 `--update-snapshots`，人工审阅 expected/actual/diff 后提交。不能为让测试变绿自动接受基准。

普通成功测试不批量截图。Playwright 原生失败 screenshot、trace、video 按实际隐私边界保留，涉及凭据的路径不得上传含会话信息的 trace。使用合成数据，证据不得包含真实个人信息或 Secrets。PR 描述链接 Actions 的脱敏工件即可；本机通过不代表远程检查通过。
