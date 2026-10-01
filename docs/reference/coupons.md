---
kind: reference
lang: zh
canonical: true
---

# 活动优惠券与核销契约

> 文档归属：[现行参考](README.md)。

## 发放与展示

[ActivationService](../../apps/api/src/modules/activation/activation.service.ts) 对满足问卷提交、曾主动报名、ACTIVE 且未注销的账号尝试发券。资格与活动状态在事务中复核，重复访问幂等。多个 ACTIVE 活动暂停发券，需运营消除歧义；后续访问可补偿未完成发放。

[CouponService](../../apps/api/src/modules/coupon/coupon.service.ts) 的首次概览补偿后，available/history 在同一 RepeatableRead snapshot 和判断时刻读取，避免并发核销遗漏或重复。[coupon-reader.ts](../../apps/api/src/modules/coupon/coupon-reader.ts) 定义分页、游标和账户范围。

[共享规则](../../packages/shared/src/coupon.ts) 将到期 ISSUED 券显示为 EXPIRED，无需定时写入状态。已读反馈不代表核销。

## 动态码与商家边界

[共享 TOTP](../../packages/shared/src/coupon-totp.ts) 定义动态码参数。商家 prepare 只读校验商家归属、持有人状态、期限和动态码，再签发短期 redeem ticket；预检不消耗券。

[RedemptionService](../../apps/api/src/modules/redemption/redemption.service.ts) 在事务中重新验证规则和资格，条件更新 ISSUED 为 REDEEMED，保存核销与审计。金额不满足不消耗券，并发和重试不重复核销；商家与用户归属由服务端校验。

旧合同和核销设计见 [历史归档](../archive/README.md)，不以旧领取方式覆盖现行发放契约。
