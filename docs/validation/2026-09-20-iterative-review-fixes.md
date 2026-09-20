# 2026-09-20 迭代审查与修复

## 结论与范围

在上一轮相对 main 的工作区审查基础上，完成修复、反例验证和再次审查。本次覆盖范围内，最后一轮未发现新的可复现业务缺陷；不等于证明所有路径均无缺陷。HEAD/main 基线为 `23765a33ff31b462b53c64e52d5813ec16b186bf`，实际审查对象包含原有大量未提交改动。

未执行 commit、push、merge、部署或生产数据操作。原有无关改动保持不变。

## 修复与迭代

1. 生活习惯题修改显示文案时保留标准 option value，避免已提交答案在匹配解析时失效。API 限制三道保留题的题型、标准值集合和删除操作；前端对应限制非法编辑。
2. 多选题 selectionLimit 的现有行为是必须选满。后台改为“必须选择的项数”，使配置说明、题卡和实际校验一致。
3. 首页已促成匹配统计增加 introducedAt 条件，不再计入跳过引荐、双方最终显示 UNMATCHED 的配对。
4. 迭代发现生活习惯题默认 weight=0，但编辑输入及 DTO 要求最小 1；修正为允许 0，避免原样保存失败。

第二轮检查新增题入口，补齐输入生活习惯题 Key 后自动带入标准选项及零权重，防止选项编辑限制使缺失题无法补建。第三轮检查前后端契约、保存请求、真实数据库结果、浏览器终态及本轮 diff，未发现新的可复现问题。

## 验证证据

本轮日志及专项脚本位于 Git 忽略目录 `artifacts/iteration-review-20260920/`。

| 验证 | 结果 | 日志 |
| --- | --- | --- |
| API Jest | 62 suites，578/578 通过 | api.log |
| PostgreSQL 集成 | 17 suites，89/89 通过 | integration.log |
| Web 单测 | 88/88 通过 | web-tests.log |
| Shared 单测 | 110/110 通过 | shared-tests.log |
| Storybook | 249/249 通过；另 1 个文件 skipped，不计为通过 | stories-final.log |
| 全功能浏览器 E2E | Chromium、mobile-chromium、WebKit、mobile-webkit 共 72/72 通过 | browser-full.log |
| API/Web/Storybook 类型检查 | 通过 | api-types-final.log、web-types-final.log、story-types-final.log |
| Storybook 覆盖审计 | missing 为空 | coverage.log |
| 本轮 API/Web 文件 ESLint、git diff --check | 通过 | 本轮终端记录 |

新增 `apps/api/test/questionnaire-contract.e2e-spec.ts` 覆盖三道生活习惯题：零权重 DTO、修改显示文案后保存标准答案、匹配兼容、拒绝非法结构/删除；另用真实数据库验证未引荐配对统计和 UNMATCHED 快照。

独立 Node.js + Playwright 专项脚本在 Chromium 148.0.7778.96、WebKit 26.4 的 1280×900 和 390×900 视口验证实际输入与保存、禁用控件、文案和横向溢出，四种组合均通过，8 张截图在 `screenshots/`。保存请求保留 `value=不吸烟`、`label=从不吸烟` 和 `weight=0`，表单成功关闭。

Codex 内置浏览器另检查桌面和 390×844 手机布局、滚动后的保存区域及多选配置。内置浏览器运行带 userEvent 自动输入的 story 时曾出现输入未生效、严格 mock 拒绝保存；未计为通过。相同 story 在独立 Chromium 中发出的请求正确且返回 200，独立 Playwright 原生输入也通过。内置浏览器证据限于视觉检查，不能替代自动功能验证。

完整 E2E 产物：`artifacts/e2e/1ffeb1fb0c92/`。使用独立数据库、Mailpit、API、Web 和临时源码 workspace，包含生产构建。测试结束自动清理本轮容器与进程。集成测试同样使用全新 disposable PostgreSQL；未连接生产数据库。

## 剩余边界

- 远端 CI 未运行，本地结果不代表远端 CI。
- 未核查或修复生产历史问卷配置；如线上已有不符合标准 value 的生活习惯题，需在发布前核对并制定数据处理方案。
- 三道生活习惯题的正式发布、旧报名策略、真实 VIP 商品/库存/支付及生产配置仍属发布验收范围，本轮不据本地测试宣称完成。
- 日志包含既有 Storybook 图表尺寸与图片加载提示；没有将这些提示计为新增业务缺陷。
