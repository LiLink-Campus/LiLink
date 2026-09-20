# 首页本地数据库仿真

本地前端连接 `localhost:4000` 的 `lilink-api-local`，后者连接
`lilink-postgres`。邮件由本地 `lilink-mailpit` 接收。

## 初始化首页样本

```sh
npm run infra:local:api
docker exec -w /app/apps/api lilink-api-local node scripts/seed-community-demo.mjs --apply
docker restart lilink-api-local
npm run dev:web
```

脚本只接受开发环境中的本地 `lilink` 数据库，按固定 ID 幂等创建或更新其自身样本；不会覆盖其他用户。
模拟用户以普通业务记录（`isTest=false`）参与与生产相同的统计，使用虚构学校、`.invalid` 邮箱和随机不可知密码。
界面不加入开发提示或计数增量。不要将本地数据库或样本迁移到生产。

样本包含 168 个账号、7 所虚构学校、164 条已提交问卷示例及 4 个未填性别账号。
问卷示例只覆盖人数图表需要的性别字段，不是完整问卷或端到端匹配验收样本。
脚本不生成匹配关系、不报名匹配轮次、不发送邮件；因此已送出匹配仍为 0。

验证：`/v1/public/landing` 注册数与 `/v1/public/community` 总人数均为 168。
原有 `isTest=true` 的独立测试账号继续被两接口排除。
