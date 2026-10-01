---
kind: howto
lang: zh
---

# 生产发布与回滚

> 文档归属：[操作指南](README.md)。

本流程适用于已获授权的发布。先通过受控运维入口确认目标主机、数据库、Web 项目与部署 checkout；连接信息保留在受控配置中。部署文件与配置边界由 [系统拓扑](../reference/topology.md) 维护。更换资产归属、主机或数据库时，先按 [环境重建与迁移](environment-migration.md) 制定割接方案。

## 发布前准备

- 核对当前 checkout、候选 Git SHA、API 镜像和 Web deployment 的实际提交；检查未提交改动，避免把本机工作树误当作可复现候选。使用项目锁定的 Node/npm 工具链。
- 查看该精确提交全部适用 CI，涵盖 push、pull request 和专项手动 workflow。检查数据库 migration 历史与候选 migration 的兼容性；待执行 migration 和数据修复分别列出，备份与恢复预案先验证。
- 核对 API/Web 协议变化。共同变更的请求、页面 bootstrap、鉴权或错误协议需要成对发布；确定部署顺序、短暂混版是否安全以及回滚时的一对版本。
- 保存旧 API 镜像的 image ID 和独立恢复 tag，记录对应 SHA；核对旧 Web deployment 可重新指向。恢复 tag 应标识此次发布，避免后续构建覆盖唯一的恢复入口。
- 确认执行人可访问主机、云控制台、DNS、Web 项目与监控，记录维护窗口、用户通知、失败判据和停止时间。发布授权不自动包含数据库恢复、数据删除或真实支付操作。

## 发布步骤

1. 在指定部署 checkout 更新到已核验提交；保留受控配置，不用历史主机地址或文档中的旧 SHA 代替目标核验。
2. 由 [Compose wrapper](../../scripts/compose-prod.mjs) 执行 `npm run deploy:prod:config` 检查声明。提供 runtime `api_env` 和可选 source-map BuildKit secret，检查结果不得携带 secret 值。wrapper 未显式指定 `SENTRY_RELEASE` 时使用 checkout 的 HEAD；核对它与候选、镜像及 Web 观测版本一致。
3. `npm run deploy:prod:up` 构建并启动 API。[生产入口](../../apps/api/scripts/production-entrypoint.mjs) 先应用镜像内的 Prisma migrations、运行管理员 bootstrap，再启动应用；任一步失败则停止。Web 通过对应项目发布兼容版本。
4. 检查容器、代理及日志中的启动终态，确认 migrations 和应用启动完成；容器处于 running 不证明启动链成功。按兼容顺序切换 Web，并核对 API/Web 实际运行提交。
5. 执行下述验收，明确哪些证据只证明可达，哪些证明受影响的用户行为。默认最小只读探针；真实写入、送信或支付验收按专项授权执行。
6. 发布记录写明时间、环境、提交、迁移、命令、断言、证据及未验证项；在旧资源可恢复期间观察错误、延迟、邮件队列与轮次任务。

## 发布后验收

| 检查 | 判定与限制 |
| --- | --- |
| 公网与主机 loopback `/v1/health` | 核对 API 进程、TLS/代理与边缘路径；health 不读取数据库 |
| `/v1/public/landing` 与受影响业务接口 | landing 可来自缓存，不能单独证明此刻数据库可用；结合迁移状态、当前数据库读取和业务断言 |
| Web 首页和登录后的页面 | 确认实际 API/Web 版本、会话、加载/错误状态；核对受影响的账户、报名、权益或核销结果 |
| 后台轮次与邮件 | 核对 jobs 开关、任务终态、重复执行影响及队列；SMTP accepted 只表示服务商接收 |
| 观测 | 以此次 release 和时间窗口查新错误，确认告警接收人及用户症状恢复 |

公网无会话探针仅输出状态，避免把业务统计写入验收工件。用已核验 origin 替换占位符：

```sh
API_ORIGIN='https://<api-origin>'
curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}\n' "$API_ORIGIN/v1/health"
curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}\n' "$API_ORIGIN/v1/public/landing"
```

行为验收先在 [隔离演练](release-rehearsal.md) 或 [浏览器 E2E](browser-e2e.md) 完成。生产记录只保留脱敏的断言和必要证据，不将隔离结果描述为生产结果。

## 容器内检查

新 `docker exec` shell 不继承 API 主进程加载的配置。需要只读检查迁移时加载同一入口：

```sh
docker exec lilink-api node scripts/production-entrypoint.mjs npx prisma migrate status
```

容器名由 Compose 声明。读取日志时避免输出凭据、私有连接配置、认证头与用户数据；检查环境元数据只核对变量名是否出现。

管理员配置的行为查询 [bootstrap-admin.mjs](../../apps/api/scripts/bootstrap-admin.mjs)：缺少邮箱或密码时跳过；目标邮箱已有管理员时也跳过，不会更新其密码；否则新增该邮箱的管理员，即使已有其他管理员。更换配置不是重置旧账号。新管理员登录验证、旧管理员撤权与凭据轮换分别执行并记录。

## 维护窗口与后台任务

需要维护窗口时按 [维护中间件](../../apps/api/src/common/http/release-maintenance.ts) 和 [配置校验](../../apps/api/src/config/env.ts) 核对 `RELEASE_MAINTENANCE`、`BACKGROUND_JOBS_ENABLED`、`MAIL_DELIVERY_ENABLED`。变更进程配置需要相应重启；重启仍会执行启动链里的 migration 和 bootstrap。

维护模式允许 health、OPTIONS 和持有受控绕过 cookie 的请求继续进入应用；绕过请求仍按正常业务权限执行，也可能写入。后台开关不能约束外部脚本、其他容器或已有的进行中任务。数据库最终导出、恢复与迁移须按 [迁移指南](environment-migration.md) 排查所有写入者并建立单写边界，不仅依赖维护页或屏蔽 POST。

## 回滚

核对失败范围、已执行迁移和新版本是否接受写入。API/Web 存在 breaking contract 时恢复兼容的一对版本；数据库迁移不能仅通过回滚镜像撤销。新旧数据库分别接受写入会产生两套事实源，需先明确单写边界和恢复方案。

只有确认旧代码兼容当前数据库、已将恢复镜像设为 Compose 实际使用的 image tag 后，才用 `npm run deploy:prod:up:no-build` 重启已选镜像；此命令不会自动选择历史镜像，入口仍会运行该镜像包含的 migrations。Web 回滚到对应已核验 deployment。不能证明兼容时，保留维护窗口并制定修复或受控数据恢复方案。

再次核验精确版本、迁移和用户状态后记录结果。目标数据库已经接受新写入时，切回旧数据库必须先解决增量数据与唯一写入方；直接切 DNS 会丢失新状态或产生双写。

故障检查见 [值守排查](incident-response.md)。过去的单次主机清理与发布观察由 [实施记录](../records/README.md) 保留。
