---
kind: howto
lang: zh
---

# VIP 卡密运营

> 文档归属：[操作指南](README.md)。

行为见 [VIP 契约](../reference/vip.md)。先用隔离环境与合成卡密验证，生产导入、停用和外部退款分别取得授权。

## 导入

1. 核对商品、订单和批次，将明文保存在受控且 Git 忽略的目录，不打印或截图。
2. 用摘要脚本生成清单；已有目标文件拒绝覆盖：

```sh
node apps/api/scripts/vip-manifest.mjs .agent-local/vip/cards.txt .agent-local/vip/manifest.json <batch-id>
```

3. 在具有正确配置的受控环境预览目标与数量，确认批准的批次后应用：

```sh
node apps/api/scripts/vip-codes.mjs import .agent-local/vip/manifest.json
node apps/api/scripts/vip-codes.mjs import .agent-local/vip/manifest.json --apply
```

API 须已构建；重复导入跳过已有摘要，不恢复停用卡。配置加载见 [生产发布](production-release.md)。

## 退款与停用

核对订单及账号，仅为该订单的码生成摘要清单，预览后应用：

```sh
node apps/api/scripts/vip-codes.mjs revoke .agent-local/vip/refund-one.json
node apps/api/scripts/vip-codes.mjs revoke .agent-local/vip/refund-one.json --apply
```

通过 CLI 调整剩余权益，不直接修改数据库标记。由运营完成平台退款并留存受控订单记录；上架、库存和真实支付按注明日期的运营证据确认。
