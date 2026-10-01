---
kind: plan
lang: zh
---

# 文档核验后的待确认事项

> 文档归属：[实施计划](README.md)。

## 产品决策

| 事项 | 已确认事实 | 待确认内容 |
| --- | --- | --- |
| 秋季冗余偏好建议 | 旧决策提出删除年龄区间、对方颜值与精简体重；当前匹配硬条件仍处理相关字段 | 是否继续推进该建议，或由后续已实现的筛选方案取代；确认前保持现行契约 |
| 丘比特机制 | 文档标为设计完成、待评审；现行 AppModule 没有对应机制模块 | 是否安排评审、排期及最终隐私/通知契约 |
| 新环境迁移 | [迁移指南](../guides/environment-migration.md) 维护操作方法，[迁移计划](environment-migration.md) 保存组织资产与实施选择 | 是否启动迁移、目标资源、数据范围、恢复目标与执行窗口；旧提案不证明切换已执行 |
| 现场生产拓扑 | 仓库声明 API Compose、Caddy、Web 和可选服务端直连 | 当前 DNS、provider、host、运行 SHA 与控制台配置需有时间戳的受控只读核验 |

## 核验来源

- [秋季设计决策入口](../decisions/autumn-2026/README.md)。
- [当前硬条件](../../apps/api/src/modules/questionnaire/hard-match.ts)。
- [AppModule](../../apps/api/src/app.module.ts)。
- [系统拓扑](../reference/topology.md)。

本页保存未决状态；确认后的行为进入现行参考，理由进入决策记录，发生过程保留日期及证据。

## 原型维护任务

| 任务 | 原因与影响 | 完成条件 |
| --- | --- | --- |
| DOCS-PROTOTYPE-01 | [历史埋点副本](../../prototypes/autumn-2026/web/src/lib/product-analytics.ts) 仍导入当前 shared 已移除的产品事件导出，Next dev 存在编译告警；已有视觉预览交互通过，未验证生产构建 | 继续开发该副本前明确历史依赖版本或单独升级副本的方案，保留原始源文件证据，通过跨引擎行为验收；不向现行 shared 恢复退役内部接口 |
| DOCS-PROTOTYPE-02 | 原型等待状态的中文日期在 WebKit 与 Node Intl 中空格不同，导致 hydration mismatch 后恢复 | 若升级副本，保证服务端/客户端日期输出一致，复核等待状态与其他预览路径，同时保留未修改的历史来源 |

任务证据与维护边界见 [文档重整验收](../records/2026-10-01-documentation-reorganization.md)。这些任务不代表原型属于正式部署应用。
