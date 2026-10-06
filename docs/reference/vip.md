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

## 资料页与用户中心读取

两页通过 dashboard 局部 [useVipStatus](../../apps/web/src/app/dashboard/_lib/use-vip-status.ts) 读取，不跨账号缓存权益。有效服务端 bootstrap 直接展示；`vip=null` 表示初值未知，可见时立即读取，隐藏时等待恢复。每个实例前台每 30 秒校准，最多一个在途请求；隐藏时清除轮询与到期定时器并取消读取，恢复立即重算本地到期并刷新。恢复后的 visibility/focus 事件在 500 毫秒内合并，每次新的隐藏/恢复独立刷新。

新 bootstrap 对象（包括同账号 null→null）、账号变化、退出再登录或卸载均使旧读取失效。主动取消不生成刷新错误；失败和超时释放在途锁，等待正常调度重试。已知到期在前台及时撤下权益，后台跨过到期点后恢复时同步校准。浏览器取消不能证明服务端 SQL 被取消。

hook 返回最后成功的数据及刷新错误。资料页普通失败保留旧权益并显示错误，本地到期仍生效；用户中心普通失败隐藏旧权益并显示“状态待刷新”。属于仍有效生命周期的 401 清除权益，旧生命周期的成功、401 和普通失败都不能影响新状态。直接 `GET /me/vip` 与 bootstrap VIP 复用 [私有 parser](../../packages/shared/src/private-page-parsers.ts)，拒绝非法字段及非规范日期；日期 null 的既有含义保持。

## 停用

[vip-revocation.ts](../../apps/api/src/modules/vip/vip-revocation.ts) 按单卡独立时段移除未使用权益、前移后续卡到期日，保留其他卡剩余时长。停用与兑换采用用户优先的锁顺序，归属变化有界重试，重复停用幂等。

操作步骤见 [VIP 卡密运营](../guides/vip-operations.md)。外部收款、卡密交付和退款须运营核对；源码不证明真实支付已验收。
