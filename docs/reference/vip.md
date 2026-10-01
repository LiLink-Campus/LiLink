---
kind: reference
lang: zh
canonical: true
---

# VIP 权益与兑换契约

> 文档归属：[现行参考](README.md)。

[VipService](../../apps/api/src/modules/vip/vip.service.ts) 定义价格、期限、状态与结果。每张卡贡献独立的 30 天权益；价格查询状态接口的 `priceYuan`，商品上架和库存查询注明时间的运营记录。

## 有效性与幂等

有效权益要求未停用且未到期。高级筛选与匹配 VIP 优先共用有效权益判断；优先级顺序由 [匹配参考](matching.md) 维护。

激活码规范化和格式校验后保存 SHA-256 摘要，明文不进入业务数据库。同一账号重复兑换同一码返回 ALREADY_REDEEMED，不增加期限；另一账号不能兑换已使用码。不同码对同一账号串行处理，单码归属通过条件更新竞争。

新码在已有有效期后顺延；已过期则从激活时刻计时。结果区分 ACTIVATED、EXTENDED、REACTIVATED、ALREADY_REDEEMED。不可用或注销账号不能兑换。

## 停用

[vip-revocation.ts](../../apps/api/src/modules/vip/vip-revocation.ts) 按单卡独立时段移除未使用权益、前移后续卡到期日，保留其他卡剩余时长。停用与兑换采用用户优先的锁顺序，归属变化有界重试，重复停用幂等。

操作步骤见 [VIP 卡密运营](../guides/vip-operations.md)。外部收款、卡密交付和退款须运营核对；源码不证明真实支付已验收。
