# 破冰手工测试指南

这份指南用于在本地环境手工验证破冰（Meetup / Ice Break）主流程。测试数据由脚本生成，可以重复执行；每次执行都会重建同一个 demo 轮次和匹配，因此适合在每条测试用例前重置状态。

## 前置条件

1. 确认本地 API 环境变量已配置，通常需要 `apps/api/.env`。
2. 确认 PostgreSQL 正在运行。
3. 应用已有 migration：

```sh
npm run db:migrate:deploy
```

4. 启动本地服务：

```sh
npm run dev
```

如果只需要分开启动，也可以分别运行：

```sh
npm run dev:api
npm run dev:web
```

默认访问地址：

- Web: `http://localhost:3000`
- API: `http://localhost:4000/v1`

## 生成测试数据

默认场景会创建一条已引荐匹配，并由对方账号先发起破冰方案，当前测试账号需要响应：

```sh
npm run db:seed-meetup-demo
```

脚本会输出 `directUrl`、`matchId`、`sessionId` 等信息。打开输出里的 `directUrl` 即可进入对应页面。

固定测试账号：

```text
Alex:
  email: meetup.demo.alex@lilink.test
  password: MeetupTest2026!

River:
  email: meetup.demo.river@lilink.test
  password: MeetupTest2026!
```

Alex 是主要手工测试账号；River 是对方账号，用于最终确认等双人流转。

## 场景 A：响应对方方案

1. 执行：

```sh
npm run db:seed-meetup-demo
```

2. 打开脚本输出的 `directUrl`，用 Alex 登录。
3. 验证页面状态：
   - 状态是协商中。
   - 页面提示需要 Alex 响应。
   - 当前方案包含 2 个时间和 2 个地点。
   - 接受、拒绝、重新提议、取消入口可用。
4. 选择一个时间和一个地点并确认接受。
5. 验证 Alex 视角变成等待对方最终确认。
6. 退出 Alex，使用 River 登录同一个 `sessionId` 页面。
7. 点击最终确认。
8. 验证 session 进入已锁定状态，并展示确认后的时间和地点。

## 场景 B：拒绝后由对方继续推进

1. 重新执行：

```sh
npm run db:seed-meetup-demo
```

2. 用 Alex 打开 `directUrl`。
3. 点击拒绝方案，可填写拒绝说明。
4. 验证 Alex 视角不再需要响应。
5. 用 River 打开同一个 session。
6. 验证 River 需要响应，并可以重新提交新方案。

## 场景 C：当前用户重新提议

1. 重新执行：

```sh
npm run db:seed-meetup-demo
```

2. 用 Alex 打开 `directUrl`。
3. 点击重新提议，选择 2 到 3 个时间和 2 到 3 个地点。
4. 提交前确认弹窗里的摘要与实际将提交的时间、地点、备注一致。
5. 提交后验证 River 变成需要响应的一方，Alex 变成等待对方。

## 场景 D：取消破冰

1. 重新执行：

```sh
npm run db:seed-meetup-demo
```

2. 用 Alex 打开 `directUrl`。
3. 点击取消，可填写取消说明。
4. 验证页面进入已取消终态。
5. 验证接受、拒绝、重新提议、最终确认都不可再操作。
6. 回到 `/dashboard/match`，验证展示终态文案，而不是重新发起 CTA。

## 场景 E：从匹配页发起破冰

如果要验证还没有 session 时的发起流程，生成 `not-started` 场景：

```sh
npm run db:seed-meetup-demo -- --scenario=not-started
```

1. 打开脚本输出的 `directUrl`，用 Alex 登录。
2. 验证页面是破冰发起表单。
3. 选择 2 到 3 个时间和 2 到 3 个地点。
4. 提交第一条方案。
5. 验证成功后跳转到 `/dashboard/meetup/:sessionId`。
6. 用 River 登录同一 session，验证 River 需要响应。

## 场景 F：锁定后修改

1. 先按场景 A 走到已锁定状态。
2. 在确认时间开始前，用 Alex 或 River 打开 session。
3. 点击修改安排。
4. 修改时间或地点并提交。
5. 验证提交前确认弹窗展示的是即将提交的新方案，而不是旧方案。
6. 验证 session 回到协商中，另一方需要响应。
7. 同一个用户再次尝试锁定后修改时，应被禁用或失败，因为每人只有一次修改机会。

## 检查重点

- 只有 session 参与者可以访问破冰页面。
- 已引荐匹配才可以创建破冰 session。
- `LIMITED` 只限制 match 卡片细节展示，不是既有破冰 session 的硬访问门槛。
- `ACTIVE` 普通协商中的取消在确认时间已开始后仍允许；`LOCKED` 的取消在确认时间开始后不允许。
- `seen` 只应在 session 页面成功渲染后触发，普通预取或 dashboard 请求不应触发。
- 终态 `CANCELED`、`EXPIRED`、`ARCHIVED` 不能通过用户操作回到 `ACTIVE` 或 `LOCKED`。

## 常见问题

- 如果 API 报 `MeetupSession` 表不存在，先执行 `npm run db:migrate:deploy`。
- 如果 `npm run db:migrate` 因 shadow database 权限失败，本地手工体验可改用 `npm run db:migrate:deploy` 应用已有 migration。
- 如果登录后回到 dashboard 而不是破冰页，复制脚本输出的 `directUrl` 重新打开，或手动访问 `/dashboard/meetup/{sessionId}`。
- 如果浏览器里已有其他用户 session，先退出登录，或用无痕窗口测试。
