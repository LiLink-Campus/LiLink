---
kind: changelog
lang: zh
---

# 学校存在即允许教育认证

> 文档归属：[验收记录](README.md)。

学校中心删除认证开关与说明，创建/编辑不再发送该字段。学校配置及邮箱域名存在即允许注册教育身份、教育邮箱升级和邀请码学校选择，历史关闭标记不再阻断。既有管理 API 与数据库字段暂保留兼容，创建/修改统一写 true。学校删除继续清理域名、学校关联、问卷引用和相关缓存，不清除用户教育认证时间。删除确认框明确告知已有身份保留。

## 复现环境与命令

macOS、项目 Node/npm、Docker 隔离 PostgreSQL 17/Mailpit、Playwright Chromium/WebKit。仅使用合成学校及账号；不操作开发库或生产库中的学校。端到端测试关闭凭据 trace、视频和自动失败截图，仅保留无凭据学校表单截图与断言附件。

```sh
npm run typecheck:api
npm run typecheck:web
npx tsc -p e2e/tsconfig.json
npm run test --workspace api -- --runInBand --testPathPatterns='admin-school.service|public.service|auth.service|school-resolver|education'
npm run test --workspace api -- --runInBand --testPathPatterns='community-stats'
npm run lint:api
npm run lint:web
npm run test:ci:stories
node scripts/e2e/run.mjs e2e/specs/school-membership.spec.ts --project=chromium --project=webkit --project=mobile-webkit
```

## 断言与证据

- API 相关既有行为套件 42/42，社区统计 3/3；调整过时开关断言，没有新增单元测试。
- Web/API/E2E 类型及 lint 通过；Web lint 保留两项既有警告。API lint 使用项目的修复模式，已检查差异。
- Storybook 固定集合 221/221；学校编辑场景新增“无开关、无旧说明”断言。
- 真实端到端覆盖：界面创建学校即允许教育认证；数据库旧 false 值不影响公开列表或认证；管理员从界面删除学校后公开列表移除；删除前发出的验证码不能新增认证，新的发码请求被拒绝，邀请码不能选择已删学校；已有账号认证时间保持、学校关联为空，用户中心仍显示教育用户。
- 初次运行修正测试对图标按钮的定位；第二次运行已通过旧验证码拒绝断言，随后命中同一邮箱 30 秒重发限制。最终运行使用该已删除域名下的新邮箱验证发码拒绝，未关闭节流或放宽资格断言。
- 内置浏览器人工检查桌面和 375px 移动端的学校编辑表单；截图 `artifacts/school-membership/iab-desktop.jpg`、`iab-mobile.jpg`，使用 Storybook 合成学校。
- 本地 API 容器因仍加载旧编译产物已重启，确认运行时教育服务不再判断旧开关、管理服务统一写 true；公开学校接口恢复正常。未更新真实学校数据，未提交或部署。

最终端到端 run 与结果补充在下方。Playwright WebKit 代表引擎覆盖，不代表安装版 Safari 或物理 iPhone。远程 CI 未执行；此前 Linux 固定门禁下载阻塞的限制不变。

最终 run `f5effca7f318`：Chromium、桌面 WebKit、移动 WebKit 共 3/3 通过。报告 `artifacts/e2e/f5effca7f318/report/index.html`，各项目包含 `school-editor.png` 与 `school-membership` JSON 断言附件；日志 `artifacts/school-membership/e2e-accepted.log`。Runner 已清理临时数据库和邮件容器。其他检查输出位于同目录 `api-tests.log`、`community-tests.log`、`stories.log`、`lint-api.log`、`lint-web.log`。本轮没有重跑未变更的教育身份匹配矩阵，不将构建成功代替上述用户路径验收。
