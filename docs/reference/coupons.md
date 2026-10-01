---
kind: reference
lang: zh
canonical: true
---

# 活动优惠券与核销契约

> 文档归属：[现行参考](README.md)。

## 发放与展示

个人邀请与商家优惠活动分别管理。注册写入推荐人及渠道，当前新注册的 `referralCampaignId` 为 null；发券不要求从某个商家活动链接注册，也不按旧冻结活动归属选择模板。

[ReferralController](../../apps/api/src/modules/referral/referral.controller.ts) 对邀请点击生成带服务端 salt 的访客哈希，跳过机器人与预览请求；[ReferralService](../../apps/api/src/modules/referral/referral.service.ts) 按推荐码、UTC 日期与访客哈希去重，原始 IP/UA 不入库。分享按钮点击与成功注册是不同事件，点击或分享不能证明已完成激活或领券。

[ActivationService](../../apps/api/src/modules/activation/activation.service.ts) 对满足问卷提交、曾主动报名、ACTIVE 且未注销的账号尝试发券。资格与活动状态在事务中复核，重复访问幂等。多个 ACTIVE 活动暂停发券，需运营消除歧义；后续访问可补偿未完成发放。

当前唯一 ACTIVE 活动还须处于起止时间内；模板和商家启用且模板未到期才发放。`CampaignActivation(userId, campaignId)` 与 `couponsGrantedAt` 记录一次发放，`Coupon(userId, templateId)` 唯一约束防重复。`firstOptedInAt` 是曾报名信号，取消本轮报名不会清除它。没有可发模板时不完成发放门槛，后续访问仍可补偿。

[CouponService](../../apps/api/src/modules/coupon/coupon.service.ts) 的首次概览补偿后，available/history 在同一 RepeatableRead snapshot 和判断时刻读取，避免并发核销遗漏或重复。[coupon-reader.ts](../../apps/api/src/modules/coupon/coupon-reader.ts) 定义分页、游标和账户范围。

[共享规则](../../packages/shared/src/coupon.ts) 将到期 ISSUED 券显示为 EXPIRED，无需定时写入状态。已读反馈不代表核销。

## 动态码与商家边界

[共享 TOTP](../../packages/shared/src/coupon-totp.ts) 定义动态码参数。商家 prepare 只读校验商家归属、持有人状态、期限和动态码，再签发短期 redeem ticket；预检不消耗券。

动态码为 60 秒周期、6 位数字，校验接受相邻时间窗口；它缩短截图有效期，不保证截图绝不被他人使用。[RedeemTicketService](../../apps/api/src/modules/redemption/redeem-ticket.service.ts) 签发绑定券与商家、有效 3 分钟的 JWT；票据自身在有效期内可重放，一次性来自券状态的条件更新与 `Redemption.couponId` 唯一约束。

[RedemptionService](../../apps/api/src/modules/redemption/redemption.service.ts) 在事务中重新验证规则和资格，条件更新 ISSUED 为 REDEEMED，保存核销与审计。金额不满足不消耗券，并发和重试不重复核销；商家与用户归属由服务端校验。

规则支持满减、折扣、赠品和自定义展示。需要消费金额的券先评估规则，缺金额或未达门槛返回 NEED_AMOUNT/BELOW_THRESHOLD；核销保存金额、实际优惠与赠品快照。商家填写金额用于规则与对账，不构成防造假证明。

旧合同和核销设计见 [历史归档](../archive/README.md)，不以旧领取方式覆盖现行发放契约。
