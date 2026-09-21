# 重用归档中的基础资料

本次按用户要求，将昵称、联系方式、性别和一句话介绍保留给新版资料使用。昵称与联系方式一直保存在账户及联系方式表中，无需迁移；仅补回归档中的性别和一句话介绍。

## 回填边界

- 来源仅限 `autumn-reset-2026-09-20` 归档，并匹配原 response ID 和 user ID。
- 只处理当前版本、未注销、尚未编辑的空白答卷：`updatedAt` 必须仍等于归档时刻，答案为空，草稿、提交时间和确认记录均为空。
- 已保存新版草稿、已提交、修改过或清空过的资料全部保留，不再从旧记录覆盖。
- 旧草稿明确包含这两项时优先采用草稿；旧草稿中的主动清空也保留。只接受现有性别选项和长度为 1–200 字的一句话介绍。
- 不修改昵称、联系方式、旧归档、历史匹配、报名、公开统计口径及其他问卷答案。不恢复提交或报名资格，也不发送邮件。
- 一次性数据迁移，不增加每次请求查询归档的开销；迁移重复执行不会覆盖后来保存或清空的资料。

## 验证

```bash
node scripts/e2e/run.mjs --api --testPathPatterns=profile-basics-reuse.e2e-spec.ts
node scripts/e2e/run.mjs e2e/specs/profile.spec.ts --grep 'archived profile basics'
npx tsc -p e2e/tsconfig.json --noEmit
npm run typecheck:api
```

API 测试验证回填白名单、新草稿和新提交保护、清空保护、注销与非当前版本排除、非法旧值、归档不变及幂等性。浏览器测试验证四项资料显示、其他题目仍为空、报名被阻止，以及清空介绍后的保存与刷新。所有自动化数据仅在运行器创建的隔离数据库中生成。

## 发布与恢复

迁移文件：`apps/api/prisma/migrations/20260921110000_reuse_archived_profile_basics/migration.sql`。发布前记录候选数量和归档、联系方式、历史匹配、报名记录摘要，并备份 active response。执行标准 Prisma migration，完成后比对摘要、确认提交数量不增加，再验证生产资料页。

如需撤回，只能对迁移后仍未被用户编辑的行恢复备份；须同时匹配迁移后的答案和 `updatedAt`。已产生的新草稿、提交、资料修改必须保留。单纯回滚 API 镜像不会撤销本次数据补回。
