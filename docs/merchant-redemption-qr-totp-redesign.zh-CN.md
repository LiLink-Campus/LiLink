# 商家核销重构：动态二维码 + TOTP + 用户端推广展示

本文档记录商家核销流程的当前实现设计：用户出示动态二维码或文本码，商家完成两步核销，用户端在核销后展示商家推广信息。

## 1. 背景与动机

旧核销流程中，用户在 dashboard 看到一串 10 位明文核销码（`Coupon.code`），商家在自己的 portal 手动输入该码完成核销。重构解决三点产品问题：

- **P0**：核销码应渲染为二维码。不必做 app 内置扫码要权限，二维码直接编码一个 redeem URL，商家用任意扫码工具扫出网址、用已登录商家账户的浏览器打开即可核销。
- **P1（防转卖）**：用 TOTP，每张券依据 seed 生成、60s 动态刷新二维码，防止二手贩子转卖截图。不追求强安全，可接受 seed 保存在浏览器。
- **P1（用户端推广）**：用户核销成功后，在**用户端**展示商家 promotion 信息（电话、公众号二维码）。

这三点强耦合：新流程改变了"谁出示、谁扫、谁核销、核销后谁的屏幕看到什么"，因此合并为一次核销流程重构。

## 2. 目标与非目标

### 目标
1. 用户券渲染为**动态二维码**（编码 redeem URL），任意扫码工具可扫。
2. 二维码内容基于**每张券独立 seed 的 TOTP**，每 60s 刷新；旧截图在**约 1–2 分钟内失效**（含 `window=±1` 容错，见 §6）。
3. 保留**手动输入**后备路径，但手动码也是动态的（文本核销码随 TOTP 同步刷新）。
4. 商家扫码 / 手动输入后，进入**确认页**（可输消费金额），确认后完成核销。
5. 用户出码设备**轮询**感知核销成功，自动切换到「核销成功 + 商家推广信息」。
6. 商家端核销成功只显示成功与对账信息，**不再展示商家 promotion**。

### 非目标（YAGNI）
- 不做 app 内置扫码（依赖系统/微信扫一扫等）。
- 不追求强安全：接受 seed 存浏览器、`code` 为公开明文定位标识。
- 不引入对象存储 / 图片上传：商家公众号二维码沿用现状的图片 https URL。
- 不做实时推送（WebSocket/SSE）：用户端用轮询。

## 3. 核心决策摘要

| 主题 | 决策 |
| --- | --- |
| 二维码内容 | redeem URL：`https://<origin>/r/<code>#t=<totp>`，TOTP 放 **hash fragment**（不发送服务器、不进访问日志/analytics） |
| 扫码后核销 | 打开 URL → 确认页（含金额输入）→ 确认核销（两步） |
| 手动后备 | 保留，文本核销码 `<code>-<totp>`，与二维码同步 60s 刷新 |
| 文本码格式 | 定位段 6 位大写字母数字（去 I/L/O/0/1）+ `-` + 动态段 6 位数字 |
| TOTP 库 | `otpauth`（前后端同构，置于 `packages/shared`）；`period=60`、`digits=6`、`SHA1`、验证 `window=±1` |
| TOTP 验证点 | 仅在「商家 prepare（打开 URL / 提交手动码）」那一刻校验新鲜度 |
| seed 存储 | 券上保存 `totpSecret`，下发到用户浏览器 localStorage 本地生成码（弱安全可接受） |
| 确认页时效 | 验 TOTP 通过即签发 3 分钟 `redeemTicket`（无状态签名 JWT）；它不是密码学意义的"一次性"，**重放由 Coupon CAS 单次核销兜底**（见 §8.3） |
| 暴力防护 | prepare/redeem **专门的路由级严格节流**，不依赖全局默认（见 §8.2/§10） |
| 用户端感知核销 | 轮询 `GET /me/coupons/:id/status`（每 2–3s） |
| 商家 promotion 展示 | 仅用户端展示（电话/公众号二维码）；商家端核销成功不展示 |
| 公众号二维码 | 沿用现状图片 https URL，用户端 `<img>` 展示 |

## 4. 端到端时序

```
用户手机(出码页)                  商家(已登录浏览器)            API
 │ 打开"我的券"→出码页
 │ ──取 code+secret───────────────────────────────────────▶ GET /me/coupons/:id/redeem-secret
 │ ◀──────── { code, secret, period, digits } ────────────
 │ 本地每60s生成动态码 totp
 │ 渲染①二维码(/r/<code>#t=<totp>)
 │       ②文本码 <code>-<totp>（手动后备）+ 倒计时
 │ ┄┄每60s同步刷新┄┄
 │                        扫二维码 / 或手动读出文本码
 │                        ──打开 /r/<code>#t=<totp>────────▶ (页面加载, 读 location.hash)
 │                        ──prepare { code, totp }─────────▶ POST /merchant/redeem/prepare
 │                                                          MerchantGuard + 定位券 + 验totp新鲜 + 节流
 │                        ◀── { coupon, needAmount, ticket }─
 │                        输消费金额(满减券)
 │                        点"确认核销"
 │                        ──redeem { ticket, orderAmount }──▶ POST /merchant/redeem
 │                                                          验ticket → CAS核销(兜底重放)
 │                        ◀── { result, coupon, applied } ──  (不含 promotion)
 │                        商家端显示"✓ 核销成功 + 金额"
 │ 轮询券状态(每2-3s)
 │ ──GET /me/coupons/:id/status─────────────────────────────▶
 │ ◀── { status:REDEEMED, applied, merchantPromotion } ─────
 │ 切换到"核销成功"页
 │ 展示折扣结果 + 商家电话 + 公众号二维码(<img>)
```

## 5. 数据模型变更

`apps/api/prisma/schema.prisma`：

- `Coupon` 新增 `totpSecret String`（base32 seed，发放时随机生成；非空）。
- `Coupon.code` 生成长度由 10 → **6**（仍用现有 human-code 字母表 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`，`@unique` + 重试保证唯一）。语义从"秘密核销码"变为"公开定位标识"，安全由 TOTP 承担。
- `Redemption` 新增 `giftLabel String?`：核销命中 GIFT 档位时，把赠品文案**快照**进表（与现有 `faceValueSnapshot` 同样的快照哲学）。配合已有 `orderAmount` / `actualDiscountAmount`，使 `GET /me/coupons/:id/status` 能稳定重建完整 `applied`，且不受后续模板规则变更影响（解决 B1）。
- 无新增表：`redeemTicket` 为无状态签名 JWT。

迁移说明：`Coupon.totpSecret` 和 `Redemption.giftLabel` 已随商家核销实现落库；旧开发数据如缺少 `totpSecret`，应通过本地重置或一次性补值脚本处理，不在运行时做兼容分支。

## 6. TOTP 设计

- 库：`otpauth`，**作为 `packages/shared` 的运行时依赖**（shared 现无运行时依赖，本次新增）；TOTP 生成/校验 helper 放 shared，`apps/api` 与 `apps/web` 通过 `@lilink/shared` 间接使用，保证算法完全一致（解决 S3）。`qrcode` 仅 `apps/web` 依赖（纯前端渲染）。
- 参数常量集中在 `packages/shared`（如 `COUPON_TOTP_PERIOD=60`、`COUPON_TOTP_DIGITS=6`、`COUPON_TOTP_ALGORITHM='SHA1'`、`COUPON_TOTP_WINDOW=1`）。
- **实际失效窗口**：`window=±1` 表示校验时容忍前后各一个 60s 时间窗，故旧码最长约 2 分钟内失效（解决 S1）。这是为容忍时钟漂移与扫码延迟的有意取舍，仍满足"防截图转卖"。
- seed 生成：发放券时生成 base32 secret，存 `Coupon.totpSecret`。
- 下发：`GET /me/coupons/:id/redeem-secret` 仅向券持有者返回 `{ code, secret, period, digits }`；前端缓存 localStorage，本地生成 totp，无需每 60s 请求服务器。
- 验证：后端用 `code` 定位券 → 取 `totpSecret` → `otpauth` 校验 token（`window=±1`）。

## 7. 文本核销码格式

- 形如 `K7M2QP-573821`：
  - 定位段：6 位大写字母数字（human-code 字母表，去易混字符），等于 `Coupon.code`。
  - 动态段：6 位数字，等于当前 TOTP（标准验证码形态，无大小写问题）。
- 后端解析：拆分 `-`，定位段 `.trim().toUpperCase()` 归一化匹配 `code`，动态段作为 totp 校验。
- 共享解析/拼装函数放 `packages/shared`，前端拼装展示、后端解析校验复用同一逻辑。

## 8. API 契约

### 8.1 `GET /me/coupons/:id/redeem-secret`（用户，JWT）
- 鉴权：券属于当前用户（`coupon.userId === req.user.id`），否则 404/403。
- 仅 `ISSUED` 且未过期的券可取（已核销/过期返回相应状态，前端不进入出码页）。
- 响应：`{ code, secret, period, digits }`。

### 8.2 `POST /merchant/redeem/prepare`（商家，MerchantGuard）
- body：`{ code, totp }`。
- 逻辑：
  1. `code` 归一化（trim+大写），定位券；券所属商家必须等于当前商家 JWT 的商家。
  2. 校验券状态：`ISSUED`、未过期、持券用户 `ACTIVE`。
  3. 校验 `totp` 新鲜度（`window=±1`）。
  4. 通过 → 评估是否需要金额（`needAmount`，复用 shared `requiresOrderAmount`），签发 `redeemTicket`（JWT：`{ couponId, merchantId, exp=now+3min }`，无 jti——重放由 CAS 兜底，见 §8.3）。
- 响应（成功）：`{ result:'OK', coupon:{ title, benefitText, faceValue, userDisplayName }, needAmount:boolean, redeemTicket }`。
- 响应（失败）：`{ result:'INVALID' | 'ALREADY_USED' | 'EXPIRED_CODE' }`（`EXPIRED_CODE` = totp 过期，前端提示"二维码已过期，请让用户刷新后重试"）。
- **节流（解决 B3）**：路由级 `@Throttle` 覆盖全局默认（全局为 60s/1000，过松）。建议每客户端（商家账户/IP）`limit≈30 / ttl=60s`；该端点是猜测攻击面（`code` 已公开，安全依赖 6 位 TOTP），节流是安全模型的一等组成，需有专门配置与测试，具体阈值实现时按真实核销频率校准。
- **不改券状态。**

### 8.3 `POST /merchant/redeem`（商家，MerchantGuard）— 改造现有端点
- body：`{ redeemTicket, orderAmount? }`（不再接受静态 code）。
- 逻辑：验 ticket（签名、未过期、merchantId 匹配）→ 解析 couponId → 复用现有规则评估（`NEED_AMOUNT`/`BELOW_THRESHOLD`）→ 事务内 CAS 将 `ISSUED→REDEEMED` → 写 `Redemption`（含 `giftLabel` 快照）+ 审计。
- 响应：`{ result, coupon, applied }`，**移除 `merchantPromotion` 字段**。
- **重放语义（解决 S2）**：`redeemTicket` 为无状态签名 JWT，本身不保证一次性；3 分钟内重复提交由现有事务内 `updateMany`（`ISSUED→REDEEMED`）+ `Redemption.couponId @unique` 兜底——二次提交 CAS 命中 0 行，返回 `ALREADY_USED`。无需额外的 ticket 黑名单。
- 节流：同 §8.2，路由级 `@Throttle`。

### 8.4 `GET /me/coupons/:id/status`（用户，JWT，轮询）
- 鉴权：券属于当前用户。
- 响应：`{ status, redeemedAt?, applied?, merchantPromotion? }`；`status==='REDEEMED'` 时由 `Redemption` 字段重建 `applied = { orderAmount, discountAmount: actualDiscountAmount, gift: giftLabel }`，并带 `merchantPromotion`（商家 promotionBlocks）。
- 前端每 2–3s 轮询，REDEEMED 或券失效后停止轮询并切换/退出视图。

## 9. 前端

### 9.1 用户出码页（`apps/web/src/app/dashboard/coupons/`）
- 入口：可用券点"出示核销码"。
- 取 `code+secret`（localStorage 缓存），本地 `otpauth`（经 `@lilink/shared` helper）每 60s 生成 totp。
- 渲染：①二维码 `origin/r/<code>#t=<totp>`；②文本码 `<code>-<totp>`；③刷新倒计时。
- 后台轮询 `status`，REDEEMED → 切换到「核销成功」视图（展示 `applied` + 商家电话 + 公众号二维码 `<img>`）。

### 9.2 商家确认页与手动入口
- 扫码进入 `/r/<code>#t=<totp>`：页面加载读 `location.hash` 取 totp → 调 `prepare`。
- `/merchant/redeem` 是手动后备入口：商家输 `code-totp` → 拆分 → 调 `prepare`。
- 两条路径汇聚同一「确认核销」UI：显示券信息 + 金额输入（`needAmount` 时）+ "确认核销" → 调 `redeem`。
- **未登录处理（解决 B2）**：`/r` 未登录时跳 `/merchant/login?next=/r/<code>`，商家登录后回跳；totp 在 hash fragment 中，跳转登录后必然丢失，故回跳到 `/r/<code>` 后无有效 totp → 页面提示"请让用户重新出示二维码并再次扫码"。
- totp 过期/无效 → 明确提示。
- 核销成功 → 只显示「✓ 核销成功 + 折扣/消费金额」，**不展示 promotion**。

### 9.3 共享二维码组件
- 引入 `qrcode`（web 依赖），封装 `<QrCode value=... />`。用户出码二维码用它渲染。

## 10. 安全模型与边缘情况

- 弱安全：seed 存浏览器、`code` 公开可枚举均可接受；防的是"截图转卖"——旧 totp 约 1–2 分钟失效。
- 暴力猜测：要核销需同时（已登录商家账户 + 命中真实 6 位 code 定位到本商家券 + 命中当前 totp 时窗）；`prepare`/`redeem` 路由级严格节流（§8.2）限制猜测速率，是安全模型一等组成。
- TOTP 不入日志：放 hash fragment，不随请求发往服务器，不进访问日志/Vercel Analytics（解决 S4）。
- 时钟漂移/扫码延迟：`window=±1`（实际失效窗口约 1–2 分钟）。
- 确认期超 60s：靠 ticket（3 分钟）解耦，不受 totp 过期影响；重放由 CAS 兜底。
- 券已核销：`prepare`/`redeem` 返回 `ALREADY_USED`。
- 跨商家：`prepare`/`redeem` 强制券所属商家与当前商家一致。
- 商家未登录扫码：跳 `/merchant/login?next=/r/<code>`，登录后回 `/r/<code>`（totp 已随 fragment 丢失）→ 提示重新出示再扫。
- 出码页 secret 缺失（首次/清缓存）：重新调 `redeem-secret`。
- 用户端轮询：REDEEMED 或券过期/失效后停止，避免无限轮询。

## 11. 实现位置

- `packages/shared`：新增 `otpauth` 运行时依赖；`coupon.ts`（code 长度常量、TOTP 参数与生成/校验 helper、文本码拼装/解析、redeem 响应类型去掉 promotion）、`human-code.ts`（长度 6）、`merchant.ts`（响应类型）。
- `apps/api`：`prisma/schema.prisma`（`Coupon.totpSecret`、`Redemption.giftLabel`）、`activation.service.ts`（生成 secret + 6 位 code）、`redemption/*`（prepare、ticket 签发/校验、totp 校验、redeem 改造、写 `giftLabel`、去掉 promotion 返回、路由级 throttle）、me/coupons 模块（`redeem-secret`、`status` 端点）。
- `apps/web`：新增 `qrcode` 依赖；`dashboard/coupons/*`（出码页 + 轮询 + 用户成功页）、`merchant/redeem/page.tsx`（确认页 + 手动入口 + 去 promotion）、`merchant/login`（支持 `next` 回跳）、`proxy`/中间件（识别 `/r`）、新增 `app/r/[code]/*` 确认页路由、新增 `QrCode` 组件。

## 12. 行为检查清单

1. 用户出码页：二维码与文本码每 60s 同步刷新，倒计时正确。
2. 商家扫码打开 `/r/<code>#t=<totp>` → 确认页 → （满减券输金额）→ 确认 → 核销成功；商家端只显示成功 + 金额（不含 promotion）。
3. 手动输入 `<code>-<totp>` 与扫码等价完成核销。
4. 过期/截图旧 totp 在 `prepare` 被拒（`EXPIRED_CODE`）；实际失效窗口约 1–2 分钟与文案一致。
5. 用户出码设备轮询到 REDEEMED → 自动切换显示折扣结果（含赠品文案）+ 商家电话 + 公众号二维码。
6. 跨商家、已核销（重放 ticket）、用户非 ACTIVE 等场景返回正确结果。
7. `prepare`/`redeem` 路由级节流生效（有针对性测试），不依赖全局默认。
8. 商家未登录扫码 → 跳登录回跳 `/r/<code>` → 提示重新出示再扫。
9. `@lilink/shared` 构建、API typecheck/lint/build、web typecheck/lint 通过；核销相关单测覆盖 totp 校验、ticket 流程、节流。

## 13. 设计取舍记录

| 编号 | 设计问题 | 处理 |
| --- | --- | --- |
| B1 | status 的 `applied` 无法稳定重建（gift 仅在 audit metadata） | `Redemption` 增 `giftLabel` 快照字段，status 由表字段重建 applied（§5/§8.4） |
| B2 | 未登录商家扫码回跳丢 TOTP、商家侧无 `next` | 补商家登录 `next` 回跳 `/r/<code>` + proxy 识别 `/r`；明确 fragment 丢失后提示重扫（§9.2/§10） |
| B3 | "复用现有 throttle"撑不起安全承诺（无路由级 throttle） | prepare/redeem 路由级严格节流并写明阈值与测试要求（§8.2/§8.3/§10/§12.7） |
| S1 | "60s 失效"与 `window=±1` 不符 | 全文改"约 1–2 分钟失效"并解释容错窗口（§2/§6/§10/§12.4） |
| S2 | "无状态 JWT" ≠ 一次性 | 写明重放由 Coupon CAS 兜底，无需 ticket 黑名单（§3/§8.3） |
| S3 | otpauth 依赖归属不清 | otpauth → `packages/shared` 运行时依赖（前后端共用）；qrcode → web（§6/§11） |
| S4 | TOTP 进 query 落日志/analytics | 改 hash fragment `/r/<code>#t=<totp>`（§3/§4/§8/§9/§10） |
