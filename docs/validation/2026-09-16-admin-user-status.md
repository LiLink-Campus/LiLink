# 用户详情状态与操作区分

2026-09-16，根据后台用户详情的反馈调整。

## 已确认的行为

原界面将 `ACTIVE`、`SUSPENDED`、`PENDING` 三种状态直接渲染成按钮，点击会向 `PUT /admin/users/:id/status` 发送对应状态，并非只切换展示或筛选。因此「正常」「已停用」「待激活」作为按钮文案不清楚。

当前 `AuthService.register` 在验证邮箱验证码后直接创建 `ACTIVE` 用户。正常注册没有额外的账号激活步骤。`PENDING` 仍存在于数据库枚举、默认值和示例数据中，表示尚未启用；登录逻辑与用户鉴权均要求账号为 `ACTIVE`。

这里的账号启用与推广模块的活动激活不是同一口径。推广模块 `ActivationService` 以已提交问卷和首次加入轮次为条件处理活动优惠券，本次不改动该流程。

## 页面调整

| 当前状态 | 只读展示 | 可执行操作 |
| --- | --- | --- |
| `ACTIVE` | 正常 | 停用账号 |
| `SUSPENDED` | 已停用 | 恢复账号 |
| `PENDING` | 未启用 | 启用账号 |

- 状态单独以标签展示，并说明对登录的影响。移除详情中直接设置「待激活」的按钮。
- 取消测试标记单独保留为次要操作，不再与三种状态混在一起。
- 保存时禁用账号操作，成功和失败提示在详情弹窗内显示。
- 已有列表数据刷新时保留详情界面，避免状态操作刷新造成弹窗暂时消失。
- 保留现有 API 和账号状态数据，没有新增注册激活步骤，也没有修改任何已有账号状态。

## 验证

- `npm run typecheck:web`、`npm run typecheck:storybook:web` 通过。
- 修改的 `users.module.css` 语法检查通过。
- `npm run test:storybook:web -- --run apps/web/src/stories/admin-pages.stories.tsx -t User`：10 项通过。包括用户列表正常/空/失败、资料编辑与关闭、三种账号状态、停用后恢复、启用、状态更新失败。
- 真实本地页面只读检查宽度 1440、942、900、901、560、561、390 px：状态展示、操作数量、详情关闭、焦点返回正常，没有横向溢出或页面异常。
- 停用、恢复和启用的交互使用 Storybook 合成数据和 MSW 验证；真实页面验证没有调用账号变更接口。

## 本地证据

证据保存在忽略目录 `artifacts/admin-user-status-2026-09-16/`：

- [对应用户反馈宽度的详情](../../artifacts/admin-user-status-2026-09-16/user-detail-942.png)
- [手机端已停用状态](../../artifacts/admin-user-status-2026-09-16/user-account-suspended-390.png)
- [状态更新失败提示](../../artifacts/admin-user-status-2026-09-16/user-account-status-error-1440.png)
- [浏览器检查结果](../../artifacts/admin-user-status-2026-09-16/browser-results.json)

改动已由本地开发服务加载；没有提交、推送或部署线上。
