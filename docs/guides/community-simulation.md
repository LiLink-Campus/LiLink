---
kind: howto
lang: zh
---

> 文档归属：[本目录入口](README.md)。

# 首页本地数据库仿真

本指南使用 [本地 Compose](../../docker-compose.local.yml) 的开发服务，环境职责见 [系统拓扑](../reference/topology.md)。先完成 [本地开发](local-development.md) 中的数据库迁移和默认学校目录初始化，再核对本地开发数据库和已有数据；本地 API 容器不会自动执行这些步骤。样本脚本仅管理自身固定 ID 的合成账号与示例问卷。

## 初始化首页样本

```sh
npm run infra:local:api
docker exec -w /app/apps/api lilink-api-local node scripts/seed-community-demo.mjs --apply
docker restart lilink-api-local
npm run dev:web
```

脚本只接受开发环境中的本地 `lilink` 数据库，按固定 ID 幂等创建或更新其自身样本；不会覆盖其他用户。
模拟用户以普通业务记录（`isTest=false`）参与与生产相同的统计，使用 `.invalid` 邮箱和随机不可知密码。学校从开发库中已有、允许注册且配置了邮箱后缀的目录轮流分配；脚本不创建学校，学校数量不固定。
界面不加入开发提示或计数增量。不要将本地数据库或样本迁移到生产。

样本定义由 [seed-community-demo.mjs](../../apps/api/scripts/seed-community-demo.mjs) 维护；本指南的命令与边界按该脚本核验。首次创建全部样本时包含 168 个账号、164 条已提交问卷示例及 4 个未填性别账号。再次运行只校验既有账号归属并更新学校与 `isTest`，不会重置其账号状态或问卷；已编辑样本的统计须重新核对。
问卷示例只覆盖人数图表需要的性别字段，不是完整问卷或端到端匹配验收样本。
脚本不生成匹配关系、不报名匹配轮次、不发送邮件，不改变既有匹配数量；没有其他匹配记录时，已送出匹配为 0。

在没有其他真实业务记录的空开发库中，预期 `/v1/public/landing` 注册数与 `/v1/public/community` 总人数均为 168；已有业务记录的库按相同过滤口径另行计算总数，不能将样本数量视为数据库总量。
原有 `isTest=true` 的独立测试账号继续被两接口排除。
