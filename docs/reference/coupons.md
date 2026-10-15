---
kind: reference
lang: zh
canonical: true
---

# 活动优惠券与核销契约

> 文档归属：[现行参考](README.md)。

## 活动与模板启停

草稿允许新增、编辑和启停优惠券模板；进行中只允许修改模板的 `isActive`，不允许修改券面或新增模板。结束活动时，同一事务中将全部模板停用；已结束活动禁止新增、编辑或启停模板，也不能重新发布。模板启停和活动结束共用事务锁，防止并发重新启用。[历史数据迁移](../../apps/api/prisma/migrations/20261016020000_disable_ended_campaign_templates/migration.sql) 停用已有 ENDED 活动下的模板；不会改动其他活动及已发券。停用模板停止后续发放，已领取优惠券仍按原有效期核销。

## 发放与展示

个人邀请与商家优惠活动分别管理。注册写入推荐人及渠道，当前新注册的 `referralCampaignId` 为 null；发券不要求从某个商家活动链接注册，也不按旧冻结活动归属选择模板。

[ReferralController](../../apps/api/src/modules/referral/referral.controller.ts) 对邀请点击生成带服务端 salt 的访客哈希，跳过机器人与预览请求；[ReferralService](../../apps/api/src/modules/referral/referral.service.ts) 按推荐码、UTC 日期与访客哈希去重，原始 IP/UA 不入库。分享按钮点击与成功注册是不同事件，点击或分享不能证明已完成激活或领券。

[ActivationService](../../apps/api/src/modules/activation/activation.service.ts) 对满足问卷提交、曾主动报名、ACTIVE 且未注销的账号尝试发券。资格与活动状态在事务中复核，重复访问幂等。多个 ACTIVE 活动暂停发券，需运营消除歧义；后续访问可补偿未完成发放。

当前唯一 ACTIVE 活动还须处于起止时间内；模板启用且未到期才发放。`CampaignActivation(userId, campaignId)` 与 `couponsGrantedAt` 记录一次发放，`Coupon(userId, templateId)` 唯一约束防重复。`firstOptedInAt` 是曾报名信号，取消本轮报名不会清除它。没有可发模板时不完成发放门槛，后续访问仍可补偿。

[CouponService](../../apps/api/src/modules/coupon/coupon.service.ts) 的首次概览补偿后，available/history 在同一 RepeatableRead snapshot 和判断时刻读取，避免并发核销遗漏或重复。[coupon-reader.ts](../../apps/api/src/modules/coupon/coupon-reader.ts) 定义分页、游标和账户范围。

[共享规则](../../packages/shared/src/coupon.ts) 将到期 ISSUED 券显示为 EXPIRED，无需定时写入状态。已读反馈不代表核销。

## 文字优惠与互斥组

模板只保存标题、`benefitText` 优惠内容（同时包含使用条件）、有效期和发放状态，不再要求优惠类型、金额、阶梯规则。不同档位分别创建为券。同一活动、同一商家的同名组关联到一个 `CouponRedemptionGroup`；不填组名为独立券。数据库复合外键限定组的商家与活动边界。优惠内容或互斥关系在活动发布或首次发券后固定，只允许切换发放状态。

[CouponTemplateService](../../apps/api/src/modules/campaign/coupon-template.service.ts) 校验并保存模板和组；前端不提供任意 JSON 或规则编辑器。有效天数与固定截止时间二选一，都不填为长期有效。核销数统计真实 Redemption，互斥作废不计为核销或过期；不再展示名义优惠金额总计。

## 动态码与商家边界

[共享 TOTP](../../packages/shared/src/coupon-totp.ts) 使用 60 秒周期、6 位动态码，校验接受相邻时间窗口。二维码为 `/r/<code>#t=<token>`，动态码不随初始页面请求发送。已登录核销账号打开扫码页后，直接提交 `POST /merchant/redeem`，请求只含 `code`、`totp`；手工输入核销码也使用同一接口。未登录时跳转商家登录，登录后需重新扫码。不再存在 prepare 接口、redeem ticket、确认金额或二次确认页。

[RedemptionService](../../apps/api/src/modules/redemption/redemption.service.ts) 在事务内校验核销账号、商家归属、持有人状态、有效期、券状态及动态码。优惠适用条件由店员现场判断，系统不收集消费金额、不判断门槛、不计算减免。失败动态码、过期和越权请求不消耗券或组。

互斥券通过 `CouponGroupRedemption(userId, groupId)` 唯一记录竞争一次使用机会，再条件更新目标券为 REDEEMED、保存 Redemption 和审计、将同一用户同组其他 ISSUED 券更新为 VOID / GROUP_USED，全部同事务提交。失败整体回滚；并发扫码最多一张成功。重复本券返回 ALREADY_USED，使用过同组其他券返回 GROUP_USED。用户券面只展示运营填写的优惠内容，使用限制可直接写入其中；不自动展示分组名或通用互斥提示。用户可用列表和已打开的核销码会更新，同组失效券显示“已使用同组其他优惠”。组范围不跨用户，也不影响独立券。

## 数据迁移与发布

[文字券迁移](../../apps/api/prisma/migrations/20261016030000_text_coupons_and_redemption_groups/migration.sql) 在事务中将旧规则逐档转为文字，旧说明先保留，再由[说明合并迁移](../../apps/api/prisma/migrations/20261016040000_merge_coupon_usage_notes/migration.sql) 按原顺序追加至优惠内容，最终删除独立说明字段；空说明不追加空行。模板类型、规则、名义面值已移除。既有阶梯券保持原有文字约定，不拆分、不补发，也不自动加入互斥组；新优惠按独立券配置互斥。已发券、核销记录以及历史消费金额、实际减免、赠品、名义面值快照保留。新核销不再写入这些金额字段。

本次接口与数据库变更须同时发布 Web/API。停止旧 API 后执行迁移，再启动新 API；旧前端不能继续调用已移除的两步接口。回滚需恢复旧模板列、类型及原规则数据，不能从文字可靠反推阶梯规则；生产发布前保留可恢复的数据库备份，并协调恢复匹配的 Web/API 版本。架构取舍见 [文字券与互斥组决策](../decisions/2026-10-16-text-coupon-redemption.md)。

## 商家账号与核销反馈

合作商家页面只管理商家和核销账号；整条商家标题区展开账号列表，商家之间独立分隔，账号以无内层边框的表格显示。商家列表返回 `userCount` 和 `activeUserCount`，按当前页商家聚合账号数量，不加载每个账号详情。只保留账号的 `isActive`；停用账号会阻止新登录及已有会话访问与核销。商家自身没有启停状态，需要停用合作商家的全部账号时逐个停用账号；暂停发券使用活动或优惠模板自己的状态。

新增核销账号只填写邮箱和初始密码；创建接口省略 `role` 时使用 `STAFF`，现有角色和显示名数据保留，但不在此页显示或设置。账号启停和新增后同时更新列表与商家账号概览。

核销完成后，用户端只显示“优惠券已核销。”及关闭操作，优惠券移入历史记录。商家端显示已核销的优惠约定；状态查询保留核销时间和作废原因，不再返回 `merchantPromotion`。后台不接受 `promotionBlocks` 配置，共享类型、校验和推广内容渲染均已移除。

[商家状态退役迁移](../../apps/api/prisma/migrations/20261016010000_retire_merchant_status/migration.sql) 将旧已停用商家的账号和优惠模板转为停用，保留原访问与发券限制，再删除 `Merchant.isActive` 和索引。商家修改接口不再接受 `isActive`，列表不再接受商家状态筛选，登录、守卫、活动发布、模板创建与发券不再检查商家级状态。部署应停止旧 API，迁移后启动新版本；回滚旧 API 前须恢复该布尔列及索引，迁移后禁用的账号和模板状态不会自动恢复。

[移除迁移](../../apps/api/prisma/migrations/20261016000000_remove_merchant_promotion/migration.sql) 删除 `Merchant.promotionBlocks` 及其旧推广内容，不修改优惠券或核销记录。发布时停止旧 API 后再迁移并启动新版本，旧 Prisma Client 仍会查询已删除列；回滚旧版本前须恢复该 JSONB 可空列，恢复空列不会还原已删除的推广内容。历史迁移保留原样。

旧合同和核销设计见 [历史归档](../archive/README.md)，不以旧领取方式覆盖现行发放契约。
