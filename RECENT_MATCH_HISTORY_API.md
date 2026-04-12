# 最近三次匹配记录 API

## 这次改了什么

这次只扩展后端 `GET /v1/me/dashboard` 的返回结构，没有修改 `apps/web` 里的任何前端代码。

新增字段是 `recentMatchHistory`，最多返回最近三次已揭晓轮次的记录。数据库仍然保留全量历史；这里只是把前端真正需要展示的最近三条整理出来。

当前页面依然只消费旧字段 `latestMatch` 和 `lastRevealedRound`。前端接入 `recentMatchHistory` 之后，用户端才会真正看到三条历史记录。

## 接口位置

- 接口：`GET /v1/me/dashboard`
- 鉴权：沿用用户登录态 Cookie
- Swagger 入口：开发环境下访问 API 服务的 `/docs`
  - 例如本地默认 API 地址是 `http://localhost:4000`，则文档入口是 `http://localhost:4000/docs`

## 返回新增字段

`recentMatchHistory` 是一个数组，按 `revealAt` 倒序返回，最多 3 条。

每一项结构如下：

```ts
type DashboardHistoryItem = {
  cycleId: string;
  codename: string;
  revealAt: string; // ISO 8601
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  result: "MATCHED" | "UNMATCHED" | "NOT_PARTICIPATED";
  visibility: "VISIBLE" | "LIMITED" | "NOT_APPLICABLE";
  limitedReason: "REPORTED" | "BLOCKED" | null;
  match: DashboardMatch | null;
};

type DashboardMatch = {
  id: string;
  score: number;
  reasons: string[];
  introducedAt: string | null; // ISO 8601
  currentUserRequestedAt: string | null; // ISO 8601
  reportStatus: "OPEN" | "RESOLVED" | "DISMISSED" | null;
  participants: Array<{
    userId: string;
    displayName: string | null;
    introLine: string | null;
    email: string | null;
    schoolName: string | null;
    contactRequestedAt: string | null; // ISO 8601
  }>;
};
```

## 字段语义

### `result`

- `MATCHED`
  - 这一轮确实生成过匹配对象。
  - `match` 一定有值。
- `UNMATCHED`
  - 用户参加了这轮匹配，但没有配到对象。
  - `match` 为 `null`。
- `NOT_PARTICIPATED`
  - 用户没有参加这轮匹配。
  - `match` 为 `null`。

### `visibility`

- `VISIBLE`
  - 历史匹配可正常展示。
  - `match.reasons` 和 `match.participants` 都会返回。
- `LIMITED`
  - 这条历史匹配仍然返回，但只保留流程字段，不返回可识别信息。
  - `match.id`、`introducedAt`、`currentUserRequestedAt`、`reportStatus` 仍然可用。
  - `match.reasons` 会是空数组，`match.participants` 也会是空数组。
- `NOT_APPLICABLE`
  - 用于 `UNMATCHED` 和 `NOT_PARTICIPATED` 这类无匹配对象的记录。

### `limitedReason`

- `REPORTED`
  - 当前用户对这条匹配提过举报。
- `BLOCKED`
  - 这条匹配对应的双方之间存在屏蔽关系。
- `null`
  - 该记录没有限缩。

## 旧字段兼容

下面两个旧字段还保留，当前前端还在用：

- `latestMatch`
- `lastRevealedRound`

兼容规则如下：

- `latestMatch` 现在会从 `recentMatchHistory` 里挑出最近一条 `MATCHED + VISIBLE` 的记录。
- `lastRevealedRound` 保持原有含义，不用改旧逻辑。

## 前端怎么接

这次后端没有改前端。前端需要自己在下面两个位置接入：

- 服务端取数入口：`apps/web/src/app/dashboard/page.tsx`
- 客户端类型与渲染：`apps/web/src/app/dashboard/dashboard-client.tsx`

建议前端接法：

1. 在 `DashboardPayload` 里新增 `recentMatchHistory` 类型。
2. 页面顶部如果还要保留现有“最新匹配详情卡”，可以继续读 `latestMatch`，不影响当前逻辑。
3. 再新增一个“最近三次记录”列表，直接消费 `recentMatchHistory`。
4. 渲染时按 `result` 和 `visibility` 分支：
   - `MATCHED + VISIBLE`：显示匹配度、理由、联络状态。
   - `MATCHED + LIMITED`：显示“已举报”或“已屏蔽”的摘要，不显示对方信息。
   - `UNMATCHED`：显示“本轮未匹配”。
   - `NOT_PARTICIPATED`：显示“该轮未参与”。

## 历史记录上的操作怎么复用

历史匹配记录不需要新接口，继续复用现在这两个接口：

- `POST /v1/me/matches/:matchId/contact`
- `POST /v1/me/matches/:matchId/report`

前端使用规则：

- 只有 `result === "MATCHED"` 且 `visibility === "VISIBLE"` 时，才应该展示“联系”或“举报”入口。
- 这两个操作使用 `match.id` 作为 `:matchId`。
- 如果一条旧记录还没有引荐过，后续仍然可以主动发起联系。
- 如果已经引荐过，`contact` 接口会按现有规则拒绝重复发起。
- 如果记录已经是 `LIMITED`，前端不应该再给出联系入口。

## 示例响应

```json
{
  "questionnaireSubmittedAt": "2026-04-03T09:00:00.000Z",
  "currentCycle": null,
  "lastRevealedRound": {
    "cycleId": "cycle-3",
    "codename": "第三轮",
    "revealAt": "2026-04-03T12:00:00.000Z",
    "participationStatus": "OPTED_IN",
    "matched": true
  },
  "latestMatch": {
    "id": "match-3",
    "score": 82,
    "reasons": ["你们对关系推进节奏的期待很接近。"],
    "introducedAt": null,
    "currentUserRequestedAt": null,
    "reportStatus": null,
    "participants": [
      {
        "userId": "user-1",
        "displayName": "User 1",
        "introLine": "hello",
        "email": null,
        "schoolName": "School A",
        "contactRequestedAt": null
      },
      {
        "userId": "user-2",
        "displayName": "User 2",
        "introLine": "world",
        "email": null,
        "schoolName": "School B",
        "contactRequestedAt": null
      }
    ]
  },
  "recentMatchHistory": [
    {
      "cycleId": "cycle-3",
      "codename": "第三轮",
      "revealAt": "2026-04-03T12:00:00.000Z",
      "participationStatus": "OPTED_IN",
      "result": "MATCHED",
      "visibility": "VISIBLE",
      "limitedReason": null,
      "match": {
        "id": "match-3",
        "score": 82,
        "reasons": ["你们对关系推进节奏的期待很接近。"],
        "introducedAt": null,
        "currentUserRequestedAt": null,
        "reportStatus": null,
        "participants": [
          {
            "userId": "user-1",
            "displayName": "User 1",
            "introLine": "hello",
            "email": null,
            "schoolName": "School A",
            "contactRequestedAt": null
          },
          {
            "userId": "user-2",
            "displayName": "User 2",
            "introLine": "world",
            "email": null,
            "schoolName": "School B",
            "contactRequestedAt": null
          }
        ]
      }
    },
    {
      "cycleId": "cycle-2",
      "codename": "第二轮",
      "revealAt": "2026-04-02T12:00:00.000Z",
      "participationStatus": "OPTED_IN",
      "result": "UNMATCHED",
      "visibility": "NOT_APPLICABLE",
      "limitedReason": null,
      "match": null
    },
    {
      "cycleId": "cycle-1",
      "codename": "第一轮",
      "revealAt": "2026-04-01T12:00:00.000Z",
      "participationStatus": "OPTED_OUT",
      "result": "NOT_PARTICIPATED",
      "visibility": "NOT_APPLICABLE",
      "limitedReason": null,
      "match": null
    }
  ]
}
```
