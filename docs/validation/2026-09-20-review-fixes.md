# 2026-09-20 Review 修复验证

本次修复工作区相对 main 的三项 review 问题。未提交、推送或部署，未对现有开发库或生产库执行迁移。

## 修复范围

1. `20260920100000_require_fresh_cycle_opt_in`：旧版自动续报名与手动报名没有可靠来源标记，因此对迁移开始前最后更新、尚未揭晓且未完成引荐的报名统一置为 `OPTED_OUT`，清空本轮 intent/optedInAt，并失效该用户本轮 dashboard 快照。保留 Match、历史报名及首次报名时间。既有揭晓保护会跳过这些预生成匹配，不发送联系方式。重新报名发生在迁移边界后，重跑迁移不会撤销它。
2. `20260920101000_add_lifestyle_questionnaire_revision`：为缺少生活习惯题的当前问卷创建新版本，完整复制原题目的描述、顺序、选项、权重、必填和选择数量限制，仅添加缺失的锻炼、吸烟、饮酒题。原版本和已提交答案保持原样。已有完整三题时不产生新版本；部分存在时保留已有题目配置。无需运行会覆盖自定义题目的 seed。
3. 联系方式：普通站内链接等待保存成功后跳转；保存失败或填写无效时留在联系方式题目，并允许取消待执行的跳转。未保存内容写入按账户区分的 sessionStorage，返回或刷新后恢复；检测到远端 revision 变化时要求显式重试，不自动覆盖。刷新/关闭窗口有未保存提示；保存成功删除草稿。原有请求取消、超时和 revision 冲突保护保留。

## 验证

- 隔离 PostgreSQL 17：43 个迁移成功应用；API E2E 19 suites / 107 tests 通过。新增迁移测试验证 OPEN/PREPARING/REVEAL_READY 旧报名退出、REVEALED 历史保留、预生成匹配不发送邮件、迁移后重新报名不受重跑影响，以及完整/部分缺题、自定义配置和旧答案保留。
- Web 单元测试：13 files / 88 tests 通过。
- ContactEditor Storybook：12 tests 通过，包括恢复草稿冲突、跳转失败、重新挂载、旧请求迟到、服务器已经提交但响应丢失。
- `typecheck:web`、`typecheck:storybook:web`、修改文件 ESLint、CSS 检查、`git diff --check` 通过。
- Node.js + Playwright 隔离 E2E：Chromium、mobile-chromium、WebKit、mobile-webkit，8 / 8 通过。填写后立即导航时直接检查 API 最终值；保存 503 时确认导航被阻止、刷新恢复输入、重试后服务端值正确。补充截图定位的 4 / 4 复跑通过。
- IAB：Storybook 合成数据，1440×1000 与 390×844 检查新增失败提示、输入框、重试/取消按钮、移动换行；取消跳转保留输入。WebKit 实际页面的失败/成功截图亦已保留。没有使用个人 Chrome；不是实体 iOS 验收。

## 本地证据

- `artifacts/review-20260920/fix-api-e2e.log`
- `artifacts/review-20260920/fix-web-unit.log`
- `artifacts/review-20260920/fix-contact-stories.log`
- `artifacts/review-20260920/fix-web-types.log`
- `artifacts/review-20260920/fix-story-types.log`
- `artifacts/review-20260920/fix-iab-desktop.png`
- `artifacts/review-20260920/fix-iab-mobile.png`
- `artifacts/e2e/15c40d26bd67/report/index.html` 与 `results/`：最终 8 个功能测试及四引擎失败/成功截图。最终版将提示与按钮分行，避免窄屏内联布局挤压。

可复跑浏览器回归：`node scripts/e2e/run.mjs contact-navigation.spec.ts`。
迁移回归用例：`apps/api/test/autumn-upgrade.e2e-spec.ts`，通过项目 API E2E 命令在 disposable PostgreSQL 上运行；不得使用默认开发/生产 DATABASE_URL。

## 上线影响

- 必须在旧 API/自动续报名任务停止后运行正常发布迁移，再启动新 API，避免旧代码继续写入自动报名。
- 迁移会一并撤销迁移边界前的未揭晓手动报名，因为旧记录无法可靠证明用户同意新版自动公开联系方式。仍开放且未截止的轮次可以补齐新题后重新报名；已截止或进入 PREPARING/REVEAL_READY 的轮次不擅自重开，相关用户本轮不引荐，需等待下一轮或由运营另行处理。
- 已经揭晓或完成引荐的历史结果不受影响。
- sessionStorage 草稿只保证当前标签页会话内恢复；浏览器禁用存储时仍有站内导航等待与关闭提示，不承诺关闭标签页后恢复。
- 以上是本地验证，未运行远程 CI，也未执行生产发布。
