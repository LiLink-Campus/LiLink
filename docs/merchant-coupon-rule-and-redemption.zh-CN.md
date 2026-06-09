# 优惠券阶梯规则与核销求值

本文档记录商家优惠券的阶梯规则建模和核销消费额求值：

- **§A 优惠规则建模**：把券的优惠从「单一扁平字段」升级为**版本化的阶梯（tier ladder）**。
- **§B 核销消费额与求值**：核销时由商家输入消费额，系统按阶梯自动选档、算减免/列赠品并落对账。

驱动场景为一次真实活动：1 个 Campaign + 2 个 Merchant + 2 张阶梯券（现有单活动模型已足够，**未涉及多活动**）。

- **Social（满减阶梯）**：满30减5 / 满50减12 / 满100减30。
- **Vibes（满赠阶梯）**：满50送一杯气泡饮料 / 满100送一杯软饮料或半份小食拼盘 / 满200送两杯任意饮料。

## §A 阶梯券模型

定义在 `@lilink/shared/coupon.ts`（消费方一律走 helper，不直接读 `rule`）：

```ts
type CouponBenefit =
  | { type: "AMOUNT_OFF";  amountOff: number }                    // 满减（分）
  | { type: "PERCENT_OFF"; percentOff: number; maxOff?: number }  // 折扣（1–99%，可选封顶/分）
  | { type: "GIFT";        description: string };                 // 满赠（自由文案）
interface CouponTier { minSpend: number; benefit: CouponBenefit } // minSpend 单位分
interface CouponRule { version: 1; tiers: CouponTier[] }          // 取最高达标档
```

- **粗类 `benefitType` 与档类型一致**（`validateCouponRule` 强制）：`FULL_REDUCTION↔AMOUNT_OFF`、`DISCOUNT↔PERCENT_OFF`、`GIFT↔GIFT`；`CUSTOM` 无结构化规则（`rule = null`，`benefitText` 退回 `title`）。
- **校验（`validateCouponRule(rule, benefitType)`，入口严格、抛错）**：typed 类型必须有非空 `tiers`；`minSpend` 非负整数且**严格递增**；`amountOff>0` 且不超过 `minSpend`；`percentOff∈[1,99]`、`maxOff>0`；`gift.description` 非空 ≤200 字；档数 ≤12；CUSTOM 不得携带规则。
- **运行期解析（`parseCouponRule`，宽松、不抛）**：供 render/evaluate/requiresOrderAmount 防御性解释存量/异常数据；解析不出阶梯则视为「无规则」。
- **版本号 + 判别联合**：将来加「限新客 / 限时段 / 新 benefit 类型」是加 variant、不破坏旧券数据。
- **不变量**：`CouponTemplate.faceValue` 仍是名义对账锚点，独立于 `rule`。

## §B 核销求值与 5 态

`evaluateCoupon(rule, { orderAmount })` → 选 `minSpend ≤ orderAmount` 的最高档，算 `discount`（满减=减额；折扣=`round(order*pct/100)` 封顶 `maxOff`；满赠=0 且给 `gift`）。`requiresOrderAmount(rule)` 在任一档 `minSpend>0` 时为 true。

核销结果由 3 态扩为 **5 态**（`@lilink/shared` 的 `REDEMPTION_RESULTS`）：

| 结果 | 含义 | 是否消费券 |
|------|------|-----------|
| `SUCCESS` | 求值通过并成功翻转 | 是 |
| `NEED_AMOUNT` | 阶梯券但未输入消费额（返回阶梯供店员填后重核） | 否 |
| `BELOW_THRESHOLD` | 消费额未达任一档门槛 | 否 |
| `ALREADY_USED` | 本商家 + ACTIVE 持券人已有该 REDEEMED 券（含并发败方） | 否 |
| `INVALID` | 其余（跨商家 / 不存在 / 过期 / 非 ACTIVE）一律此态，不泄露存在性 | 否 |

核销流程（`redemption.service.ts`，事务内）：

1. 按「gate」`findFirst` 读候选券（code + 本商家 + ISSUED + 未过期 + 持券人 ACTIVE）。读不到 → `ALREADY_USED`（本商家有 REDEEMED）或 `INVALID`。
2. **先求值后消费**：`evaluateCoupon` 不通过（NEED_AMOUNT/BELOW_THRESHOLD）→ 不动券，返回该券阶梯文案给店员。
3. 通过 → 同 gate 的 `updateMany` **CAS** 翻转 `ISSUED→REDEEMED`（并发败方 count=0 → `ALREADY_USED`；`Redemption.couponId @unique` 为兜底）。
4. 写 `Redemption(orderAmount, actualDiscountAmount)` + 审计（metadata 含 `gift`）。

要点：`NEED_AMOUNT`/`BELOW_THRESHOLD` **只在 gate 命中本商家有效券后出现**，跨商家/不存在仍 `INVALID`，不泄露存在性。商家输入的金额**不防欺诈**（可填假）——它只用于选档、算减免、留对账；防欺诈是另一条线（异常核销告警 + 小票抽样）。

## 对账

- `Redemption.actualDiscountAmount` 落实际现金减免（满减/折扣精确，满赠为 null）；`orderAmount` 落消费额；二者均为合同早已预留的列。
- 赠品身份记入 `AuditLog`（append-only，免加列）。
- `faceValue` 仍是运营设的名义锚点；看板可并列 `sum(actualDiscountAmount)` 作「真实让利」口径。

## 零迁移

本次**无需任何 schema 迁移**：`Redemption.orderAmount/actualDiscountAmount` 列、`CouponTemplate.rule (Json)` 合同 M0 即已落库；5 态仅为响应枚举、不入库。

## 明确不做（YAGNI）

通用条件（限新客 / 限时段 / 首次到店）、档内组合（同档既减又送）、多活动、用户端活动页——均无近期硬需求，等真有需求再加（版本号已为加条件预留）。

## 共享接口（签名）

```ts
parseCouponRule(rule: unknown): CouponRule | null
validateCouponRule(rule: unknown, benefitType: CouponBenefitType): CouponRule | null  // throws
evaluateCoupon(rule, { orderAmount?, now? }):
  | { ok: true; appliedTier: CouponTier | null; discount: number; gift: string | null }
  | { ok: false; reason: "NEED_AMOUNT" | "BELOW_THRESHOLD" }
requiresOrderAmount(rule?): boolean
renderBenefitText({ benefitType, title, faceValue, rule? }): string   // 阶梯成人话；CUSTOM 退回 title
```

## 实现位置

- shared：`packages/shared/src/coupon.ts`（模型 + 4 函数）、`merchant.ts`（5 态）、`test/coupon.test.js`。
- api：`redemption/{dto,redemption.controller,redemption.service}.ts`、`campaign/campaign.service.ts`（rule×benefitType 一致性校验、updateTemplate 复校验）、`common/validation/input-limits.ts`、`redemption`/`campaign` specs。
- web：`lib/api.ts`、`merchant/redeem/page.tsx` + `merchant.css`、`admin/merchant-admin-ui.tsx`（`CouponTierEditor` + `buildCouponRule`）、`admin/campaigns/page.tsx` + `admin.css`。

## 建议验证命令

`build:shared` / `test:shared` / `build:api` / `typecheck:web` / `lint:web` / `lint:css`。
