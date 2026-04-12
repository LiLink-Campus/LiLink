# 匹配 API 给前端的说明

这份文档只说明现有接口怎么用、代码在哪里，以及匹配语义现在是什么。前端不需要改接口路径，也不需要改请求方式。

## 当前匹配规则

- 每一轮都会基于当轮最新数据重新算分。
- 如果一对用户在历史上已经匹配过，这一对不会再次进入候选集合。
- 在“历史不重复”和硬条件通过的前提下，系统先保证覆盖率，再在可行集合里选择总分更优的结果。
- 这意味着：
  - 不保证某个用户一定拿到自己个人排序里的下一位。
  - 但如果最高分对象因为历史重复被排除，系统会继续从剩余可行候选里寻找结果。

## 后端代码位置

- 控制器：
  - `apps/api/src/modules/admin/admin.controller.ts`
  - `apps/api/src/modules/cycles/cycles.controller.ts`
- 核心匹配逻辑：
  - `apps/api/src/modules/cycles/cycles.service.ts`
- 全局请求校验：
  - `apps/api/src/main.ts`

## 前端当前调用位置

- 页面：
  - `apps/web/src/app/admin/cycles/page.tsx`
- 请求封装：
  - `apps/web/src/lib/api.ts`

前端管理端当前已经在用下面这些接口。

## 接口列表

### 1. 预演本轮匹配

- Method: `GET`
- Path: `/v1/admin/cycles/:cycleId/preview`
- 用途：在正式执行前，查看候选对和建议结果。

示例：

```http
GET /v1/admin/cycles/cm123/preview
Cookie: admin_token=...
```

返回字段重点：

- `cycleId`: 当前轮次 ID
- `totalCandidateCount`: 候选 pair 总数
- `candidates`: 候选 pair 列表
- `suggestedPairs`: 预演后建议采用的 pair 列表
- `unmatchedUserIds`: 本轮未匹配到的用户 ID
- `message`: 可选提示

### 2. 正式执行本轮匹配

- Method: `POST`
- Path: `/v1/admin/cycles/run`
- 用途：正式生成并落库本轮匹配结果。

请求体：

```json
{
  "cycleId": "cm123",
  "force": false
}
```

字段说明：

- `cycleId`: 必填，轮次 ID
- `force`: 可选，`true` 时允许强制重跑

示例：

```http
POST /v1/admin/cycles/run
Content-Type: application/json
Cookie: admin_token=...

{
  "cycleId": "cm123",
  "force": false
}
```

常见返回：

```json
{
  "ok": true,
  "cycleId": "cm123",
  "createdMatches": 12,
  "unmatchedCount": 3
}
```

如果当前没有可生成的结果，也可能返回：

```json
{
  "ok": true,
  "message": "No compatible pairs were found for this cycle."
}
```

### 3. 查看轮次详情

- Method: `GET`
- Path: `/v1/admin/cycles/:cycleId`
- 用途：查看轮次摘要信息。

### 4. 查看轮次参与者

- Method: `GET`
- Path: `/v1/admin/cycles/:cycleId/participants`
- 用途：分页查看参与者。

查询参数：

- `page`
- `pageSize`
- `status`: `OPTED_IN` 或 `OPTED_OUT`

### 5. 查看轮次匹配结果

- Method: `GET`
- Path: `/v1/admin/cycles/:cycleId/matches`
- 用途：分页查看已经生成的匹配结果。

查询参数：

- `page`
- `pageSize`

## 前端需要知道的语义变化

- 预演接口和正式执行接口现在都按同一套规则理解结果：
  - 历史重复 pair 不会再次出现。
  - 覆盖率优先于总分。
- 所以前端如果发现：
  - 某个用户这轮没有继续匹配上一轮的人
  - 某组建议结果不是单个用户视角下的“第二高分”

这属于后端有意的匹配策略，不是接口异常。

## 认证与调用前提

- 这些接口都在管理端下，需要管理员登录态。
- 前端当前通过 `fetchApi()` 发请求，并带 `credentials: "include"`，依赖 cookie 会话。

## 结论

前端当前不需要改接口路径，不需要加新参数。只需要按现有方式继续调用，并按“历史不重复 + 先保覆盖率”的语义解释预演和正式执行结果。
