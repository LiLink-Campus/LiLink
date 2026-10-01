---
kind: howto
lang: zh
---

# 生产发布与回滚

> 文档归属：[操作指南](README.md)。

本流程适用于已获授权的发布。先通过受控运维入口确认目标主机、数据库、Web 项目与部署 checkout；连接信息保留在私有运维说明中。部署文件与配置边界由 [系统拓扑](../reference/topology.md) 维护。

## 发布步骤

1. 记录候选 Git SHA、API/Web 当前 SHA、数据库 migration 状态；检查候选精确提交的所有适用 CI。远端 CI 尚未取得时注明缺口。
2. 核对前后端契约、数据库兼容性和迁移影响，准备成对发布顺序与可恢复的 API 镜像、Web deployment。影响历史数据的操作另行取得授权。
3. 在指定部署 checkout 更新到已核验提交；保留私有配置，不用历史主机地址或文档中的旧 SHA 代替目标核验。
4. `npm run deploy:prod:config` 检查 Compose 声明。通过受控方式提供 runtime secret 和可选 source-map BuildKit secret，不把 token 写进命令、文档或日志。
5. `npm run deploy:prod:up` 构建并启动 API。生产入口先应用已有 Prisma migrations、运行管理员 bootstrap，再启动应用；任一步失败则停止。Web 通过对应 Vercel 项目发布兼容版本。
6. 核对 API/Web 实际运行提交、迁移记录、私有会话和用户可见状态。`/v1/health` 检查 API 可达，`/v1/public/landing` 补充数据库读取链路；探针不能替代业务验收。
7. 发布记录写明时间、环境、提交、迁移、命令、断言、证据及未验证项。默认使用最小只读探针；真实写入或支付验收按专项授权执行。

## 容器内检查

新 `docker exec` shell 不继承 API 主进程加载的配置。需要只读检查迁移时加载同一入口：

```sh
docker exec lilink-api node scripts/production-entrypoint.mjs npx prisma migrate status
```

容器名由 Compose 声明。读取日志时避免输出配置、认证头与用户数据；检查环境元数据只核对变量名是否出现。

## 回滚

核对失败范围、已执行迁移和新版本是否接受写入。API/Web 存在 breaking contract 时恢复兼容的一对版本；数据库迁移不能仅通过回滚镜像撤销。新旧数据库分别接受写入会产生两套事实源，需先明确单写边界和恢复方案。

只有确认兼容、已恢复目标 API 镜像 tag 后，才用 `npm run deploy:prod:up:no-build` 重启已选镜像；入口仍会运行该镜像包含的 migrations。Web 回滚到对应已核验 deployment。再次核验精确版本、迁移和用户状态后记录结果。

故障检查见 [值守排查](incident-response.md)。过去的单次主机清理与发布观察由 [实施记录](../records/README.md) 保留。
