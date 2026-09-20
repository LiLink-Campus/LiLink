# 注册容量限制移除验收

2026-09-16。按产品决定取消平台注册总人数上限。

## 最终行为

- 后台运营概览移除「容量限制」、最大注册人数输入框和保存操作；首屏与刷新不再请求 `/admin/settings`。
- API 移除 `GET/PATCH /v1/admin/settings`、对应 DTO、参数长度常量和读写服务。
- 注册流程移除全局人数预检查、事务内人数检查、配置解析及容量专用 advisory lock。数据库即使残留旧 `max_registrations` 值也不再影响注册，包括错误格式的旧值。
- 邮箱验证码、学校资格、非学校邮箱邀请码额度、事务与账号唯一性校验继续保留。
- 历史 migration 和 `SystemSetting` 表保留原状；本次不重写数据库历史、不删除已有配置记录。应用运行代码已没有容量配置的读取或更新入口，无需通过改成 `0` 才能取消限制。
- 「测试数据管理」保留在默认折叠的「测试工具」中，改为单栏，并补充模拟账号、问卷、轮次和测试标记的用途。此工具会生成 30 个测试账号并加入已有的可用轮次，不会另建隔离测试轮次；本次验收没有执行生成或删除测试用户操作。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck:api` | 通过 |
| `npm run typecheck:web` | 通过 |
| `npm run typecheck:storybook:web` | 通过 |
| 修改的 `admin-common.module.css` 语法检查 | 通过 |
| AuthService、AdminService、admin DTO 单元测试 | 3 套件，63 项通过 |
| 注册与账号注销保护 PostgreSQL e2e | 2 套件，12 项通过 |
| 运营概览 Storybook 正常、空数据、加载失败场景 | 3 项通过 |
| 本地 API 旧配置接口 | 已登录管理员 GET、PATCH 均返回 404 |
| 浏览器宽度 1440、942、900、901、390 px | 概览、测试工具展开和刷新正常，无容量入口、无旧接口请求、无横向溢出和页面异常 |

数据库测试通过脚本创建独立的本地临时数据库，先应用全部 39 个迁移，再执行：

```sh
npm run test:e2e --workspace api -- --runInBand --runTestsByPath \
  test/auth-registration.e2e-spec.ts \
  test/account-deactivation-guards.e2e-spec.ts
```

覆盖旧上限已满、旧值格式错误、并发注册超过旧上限、非学校邮箱邀请码额度和注销后使用原邮箱重新注册。测试结束后已清理该临时数据库，没有修改日常预览数据库的用户和配置数据。

本地 Docker API 原先没有加载最新源文件，已重启 `lilink-api-local`，随后完成浏览器和接口验收。没有提交、推送或部署线上。

## 本地证据

- [桌面端展开状态](../../artifacts/admin-capacity-removal-2026-09-16/tools-open-1440.png)
- [手机端展开状态](../../artifacts/admin-capacity-removal-2026-09-16/tools-open-390.png)
- [浏览器验收结果](../../artifacts/admin-capacity-removal-2026-09-16/browser-results.json)
- [PostgreSQL 测试日志](../../artifacts/admin-capacity-removal-2026-09-16/postgres-tests.log)

上述截图、脚本和日志在忽略目录 `artifacts/admin-capacity-removal-2026-09-16/` 中，仅供本地复核。
