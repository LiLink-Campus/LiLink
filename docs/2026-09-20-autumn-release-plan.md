# 秋季新版：数据库迁移、部署与压测计划

> **执行状态（2026-09-20）**：用户已授权补功能、独立升级/恢复演练、业务验证、压测通过后上线。当前实现与证据见 [执行记录](2026-09-20-release-execution.md)。下文现场基线为实施前快照；生产尚未切换。

> **文档归属**：遵循 [文档总纲](README.md)。本文件记录 2026-09-20 的现场核查及拟执行步骤；是发布计划，不是上线验收记录。

## 1. 结论与本次范围

按“升级现有 Neon 数据库、沿用现有服务器与域名”制定本计划。此次已经完成 Git 冗余分支清理，以及 Vercel、Neon 和 SSH 主机只读核查；没有迁移生产数据、重启服务、切换域名或发起压测。

推荐顺序：**隔离演练与压测 → 准备可恢复备份和新版本产物 → 维护停写 → 迁移数据库 → 启动新 API → 切换 Vercel → 业务验收 → 开放访问**。本次迁移包含业务数据变更，不能用“只换 Docker 镜像”代替完整回滚。

**用户已确定的问卷方案**：旧问卷、答案和草稿独立归档，新问卷不继承旧答案，全部用户重新填写；账号资料与最近三轮匹配记录保留，更早业务记录也不删除。以 [全量重填与历史保留方案](2026-09-20-questionnaire-reset-plan.md) 为实施口径。[逐字段审计](2026-09-20-questionnaire-migration-audit.md) 保留为风险依据，旧答案局部复用/补填建议已被本决定替代。现有 8 条迁移尚不能实现本方案。

## 2. 已核实的发布基线

| 对象 | 现场结果 | 含义 |
| --- | --- | --- |
| Git | 本地 `main` 与 GitHub `origin/main` 均为 `d05eb891606d16d1902ffd79cf09223a73992836` | 固定本次候选版本 |
| 分支清理 | 删除本地和远端 `codex/autumn-2026-ui-implementation`；删除前两侧独有提交均为 0、无打开的 PR、无其他 worktree | 两边仅保留 `main`，未删除提交 |
| GitHub 检查 | 同一 SHA 的 CI、Browser E2E、Storybook Visual Evidence 均成功；后者来自原秋季分支运行 | 可作为候选构建证据，不能替代上线验收或压测 |
| Vercel 正式站 | `lilink`，香港 `hkg1`；正式域名指向 `dpl_4Q4qwqEQQ3BGwCEdWkSPwzAujTCg`，提交 `99bca86f17d9b350e8c4c8350404c2ee64732a87` | 正式前端尚未升级 |
| Vercel 新版 | `dpl_A8EYnxh7tyonamYRQEGNtZyydoEu`，候选 SHA，READY，Preview | 仅证明前端构建成功；未验证它连接独立的新 API |
| 自动发布 | `apps/web/vercel.json` 设置 `git.deploymentEnabled.main=false` | 合入 main 不会按该配置自动上线 |
| API 主机 | SSH 别名 `LiLink`；`/home/admin/lilink`；Caddy → `127.0.0.1:4000` → `lilink-api` | 单台主机、单个 API 容器 |
| API 版本 | 主机 HEAD 与容器 `dist/.sentry-release` 均为 `6606496ea38a2a089fc550d79544e471bd058bd9`；Node `22.22.3` | 候选 Dockerfile 使用 Node `24.20.0`，需验证新镜像 |
| 主机资源 | 2 个 CPU；可见内存约 3.41 GiB，swap 2 GiB；根盘 40 GiB、约 25 GiB 可用 | 当前已不是历史笔记中的 2 GiB 配置 |
| API 空闲快照 | 内存约 284 MiB、CPU 0%、重启次数 0；本机 health 成功 | 不代表高峰容量或完整业务正常 |
| 生产数据库 | Neon `dark-base-23448181`，AWS 新加坡；分支 `production` / `br-restless-credit-aozwmv5h`，数据库 `neondb`，PostgreSQL 17.11 | 已与容器实际挂载的数据库主机匹配 |
| 数据库连接 | 直连 `ep-lucky-wave-aoy717xy`；应用未覆盖连接池设置，候选代码默认 20 连接、连接超时 10 秒 | 迁移可沿用直连；增加进程前重算总连接数 |
| 数据库容量 | `pg_database_size` 26,353,664 bytes，约 25.1 MiB；compute 配置 0.25–2 CU | 控制面分支 logical_size 与 SQL 数据库大小口径不同 |
| 恢复能力 | history retention 为 21,600 秒（6 小时）；快照列表和生产快照计划均为空 | 不能将内置恢复窗口当作长期发布备份 |

生产凭据仍通过 `/run/secrets/api_env` 挂载；`CLIENT_ORIGIN` 为两个正式域名，Cookie domain 为 `.lilink.top`。凭据校验只读取存在性/长度及非敏感配置，没有输出密码、Token 或连接串。

连接限制：Vercel 连接器可读取项目列表与部署详情，但 `get_project` 存在参数适配错误；显式 team scope 返回 403，默认 scope 的部署查询成功。本机 Vercel CLI `whoami` 报 token 无效。发布前需恢复相应部署身份，并核对实际项目 Root Directory、生产环境变量和权限，不能把当前读取能力当成发布权限证明。

服务器上没有 Node/npm，Docker Compose 为 5.3.1，因此服务器操作使用 Docker Compose，不直接复制历史文档中的 npm 命令。服务器有一个未跟踪的历史 `AGENTS.override.md.bak-20260621-191015`，本次保留；没有更新服务器 checkout。

Neon 还保留 `production`、秋季 Preview 与已归档的 `vercel-dev` 三个数据库分支；它们独立于 Git 分支，未因代码分支冗余而删除数据库。清理它们需先核对引用和独有数据。

## 3. 数据库如何迁移

### 3.1 迁移清单与影响

生产有 35 条已完成的 Prisma 迁移，全部与候选仓库 SQL 的 SHA-256 一致，没有未完成或已回滚条目。候选共 43 条，需顺序执行以下 8 条。这是迁移历史核对，尚未完成完整 schema drift 比对。

以上为审计时基线；全量重填还需增加归档与新版活动答卷切换实现。实施后重新固定候选 SHA、迁移清单和总数，不能把下面 8 条当作最终发布的全部步骤。

| 顺序 | 迁移目录 | 变更与演练验收 |
| --- | --- | --- |
| 1 | `20260911120000_account_deletion` | 增加软注销字段、索引和枚举；失效带匹配的派生快照，不删除原始用户与匹配 |
| 2 | `20260913000000_contact_preferences_revision` | 增加联系方式修订号，默认 0 |
| 3 | `20260913120000_retire_meetup_reminders` | 将待发送的旧见面提醒及旧埋点重试标记为 EXHAUSTED；保留历史记录 |
| 4 | `20260914160000_match_leads` | 新增人工服务线索表及手机号唯一索引；不代表人工服务已接单 |
| 5 | `20260917080000_vip_activation` | 新增 VIP 激活表、有效期约束和索引；不会自动把旧用户变为 VIP |
| 6 | `20260919090000_authorize_legacy_match_contacts` | 仅对满足原迁移条件的旧已揭晓匹配补联系方式授权及快照；屏蔽、举报等反例必须验证 |
| 7 | `20260920100000_require_fresh_cycle_opt_in` | 撤销未揭晓轮次中缺少新版同意证据的旧报名，保留已有 introduction 的情况 |
| 8 | `20260920101000_add_lifestyle_questionnaire_revision` | 复制当前问卷为新版本，补锻炼、吸烟、饮酒三项；保留旧答案和自定义题 |

只读预估：账号 276 个，其中 ACTIVE 非测试用户 272 个、测试用户 2 个；11 个轮次全部已揭晓，当前没有待揭晓轮次。需失效匹配快照 654 条，符合历史联系方式授权条件的匹配约 50 对；现时需撤销的未揭晓旧报名为 0，需终止的旧提醒和埋点重试均为 0。当前问卷版本 1 个，三项新题均不存在，答卷记录 252 条（242 已提交、10 草稿）。新方案需核验全部原样归档、空白新版状态、账号保留和历史卡片重建。

以上数量会随业务变化；“50 对”按查询时刻估算，正式迁移使用首个秋季迁移的真实时间作为边界。停写后必须重新核对。

### 3.2 先演练，再动生产

1. 固定候选 SHA，在隔离环境构建生产 API 镜像；用候选迁移文件操作，禁止更换 Prisma 大版本或使用 `@latest`。
2. 建立独立的迁移演练分支，明确记录其 ID、父分支、时间点和数据库 endpoint。生产副本包含真实数据，限制访问、使用独立 secret，应用邮件只能进入隔离收件器；阻断外部 SMTP 和其他业务出站。不能把副本直接当压测造数库。
3. 在演练分支使用**直连**及仓库固定的 Prisma 7 执行 `prisma migrate deploy`。部分 SQL 用 `_prisma_migrations` 时间界定业务边界，不应逐段粘贴到 SQL 编辑器执行。
4. 按补齐归档切换后的最终迁移清单检查全部完成、checksum 一致、schema 与候选一致；核对用户、原始匹配、原始答卷归档、新活动答卷、优惠券等核心记录数量及外键不变量。验证原 8 条及新增迁移的实际影响，第二次 deploy 应无待执行迁移，且不覆盖已填写的新答案。
5. 用脱敏/合成案例验举报、屏蔽、未报名、注销、VIP 过期/撤销、重复揭晓与断线重试。旧匹配不得因修复缓存而补发结果邮件。
6. 在隔离环境验证从发布前备份恢复，并记录 RTO、数据计数和可登录/可读的业务终态。迁移耗时、锁等待和恢复耗时未测出前，不承诺正式停机时间。

默认采用现有库原位升级，无需把 Neon 数据搬到服务器。若改为新账号/新实例搬迁，则需单列“加密导出全部 schema、数据及 `_prisma_migrations` → 新库恢复 → 聚合核验 → 最终停写增量/重导 → 同步切换连接串”的方案。

### 3.3 旧问卷、旧答案与账号的处理口径

2026-09-20 用户决定采用全量重填。以下是目标行为，尚待实现；详见 [独立归档、重填与历史保留方案](2026-09-20-questionnaire-reset-plan.md)。

| 数据 | 处理方式 |
| --- | --- |
| 旧问卷版本和题目 | 原版本原题保留；最终新版题库单独固定并版本化，不执行默认 seed 覆盖 |
| 已提交答案 | 完整原样归档，保留旧版本、时间和确认信息；不转换、不复制到新版，所有用户重新填写 |
| 用户保存的草稿 | 原草稿独立归档；新版从空白开始，可保存新版草稿，后续保存不能覆盖旧归档 |
| 账号和资料 | 保留用户 ID、密码散列、邮箱、学校、状态、昵称、联系方式和资料及其关联；不重新注册、不批量重置密码、不自动激活停用账号 |
| 历史业务记录 | 保留已揭晓匹配、历史报名、举报屏蔽、优惠券、核销、邀请和审计。页面显示最近三个已揭晓轮次，含成功/未匹配/未参与；更早历史也保留 |
| 历史卡片资料 | 解除对当前活动问卷的依赖，使用适用旧归档或保留的历史展示资料重建；新问卷留空/重填不改写旧卡片，继续执行联系方式及屏蔽权限 |
| 新一轮报名与 VIP | 未完成新版不能报名或进入新撮合池；完成后仍须明确报名。旧账号不自动获得 VIP，旧偏好不从归档恢复到新问卷 |
| 未重填用户的访问 | 可以登录、查看账号和最近三轮历史；不以新版未完成为由阻断历史页 |

已完成 [逐题对照表](2026-09-20-questionnaire-migration-audit.md)，其差异支持全量重填决定。本次不再实施颜值映射、合法软答案预填和多选局部补填；历史原值在归档中保留，新答案由用户重新确认。

账号迁移不会自动注销现有用户；新增的软注销字段默认留空。测试账号也先保留，测试标记照旧；不得按长期未登录或未填完整就删除真实账号。

**答卷历史边界**：当前 `QuestionnaireResponse.userId` 唯一，每个用户只有一条当前答卷记录。必须先增加独立归档、原样保存并核验，再切换为新版空白活动状态；不能直接清空当前 JSON。归档与新版日常保存隔离，另准备受限加密备份和恢复演练。

**上线阻断项**：必须实现旧答卷独立归档、新版状态隔离、当前版本及完整性准入、历史卡片资料保留，并在隔离数据库和真实 HTTP/浏览器中验证。原审计复现的报名校验不完整、新填 VIP 偏好被覆盖以及最低分表示不一致仍需处理；全量重填本身不会修复这些逻辑。此次没有修改源码。

生产部署不执行两个题库 seed：`seed-defaults.mjs` 会更新当前版本题目并删除默认定义以外的题；`prisma/seed.ts` 虽创建新版本，仍会切换到与线上不同的默认题库。两者都是 27 题，现有生产增量迁移预期为 24 题，还存在四道多选数量限制差异。先补齐审计中的衔接，再通过版本化迁移升级。

## 4. 新版本如何部署

### 4.1 发布前准备

- 核查候选 SHA 未变化，确认上述 CI 和隔离验收；新版本镜像使用 SHA 标签，保留旧镜像 ID与发布前代码，避免仅依赖可变的 `latest`。
- 在独立 checkout 构建；仅把 Git 跟踪的候选代码作为 Docker 上下文，避免将本地 artifacts、备份或服务器历史文件传入构建。
- 核对新镜像能加载现有 secret 格式、管理员 bootstrap 对既有管理员不重置密码、JWT/Cookie 设置延续。Sentry token 只走 BuildKit secret。
- 在隔离 Vercel Preview 中使用独立 API、对应 CORS 和 Cookie 域完成登录验收。当前生产 CORS 仅允许正式域名；Neon 自动创建 preview 分支不等于 Preview 已连接隔离后端。
- 备好使用**生产环境变量**的 Vercel staged production 产物，并暂不分配正式域名。核对 `NEXT_PUBLIC_API_BASE_URL=https://api.lilink.top/v1`；构建读请求也需确认兼容旧 API，必要时在新 API 可用后构建。
- 安排低流量维护窗口，冻结管理员操作、自动任务及用户写入；准备维护页/API 503 与 Retry-After，避免旧页面绕过前端继续写入。
- 停写并排空在途请求后，保留可恢复的 Neon 分支/备份与加密逻辑备份，记录时间、SHA-256、聚合计数和恢复步骤。备份包含敏感数据，放受限且不入 Git 的位置；不要创建未加密明文 dump。现有 6 小时历史窗口不足以代替这一项。

### 4.2 正式窗口的执行顺序

以下是**通过隔离验收和压测后执行的命令骨架**；需先完成上一节前置项，并把新镜像和 compose 配置准备到确定的发布目录。命令中的变量必须由真实构建、备份及验收结果赋值，不能猜测。服务器没有 npm，直接用 Docker。

```sh
# Run from the verified candidate release directory on the API host.
set -eu
: "${LILINK_CANDIDATE_IMAGE_ID:?Set the verified candidate image ID}"
: "${LILINK_ROLLBACK_IMAGE_ID:?Set the current running image ID}"
export API_ENV_FILE=/home/admin/lilink/.env

# Maintenance routing and the restore rehearsal must already be ready.
docker tag "$LILINK_ROLLBACK_IMAGE_ID" lilink-api:previous-good
docker stop lilink-api
```

**在此暂停：确认所有写入者和定时任务已停止，再制作最终停写备份并核对其时间点与完整性。备份未完成不得继续下一段。** 新产物预先构建，停机窗口内不临时装依赖。以下命令沿用上段已验证的目录、变量和 shell。

```sh
docker tag "$LILINK_CANDIDATE_IMAGE_ID" lilink-api:latest

# Explicit command loads the secret but does not start the API or its cron jobs.
docker compose -p lilink -f docker-compose.prod.yml run --rm --no-deps api \
  node scripts/production-entrypoint.mjs npx prisma migrate deploy
docker compose -p lilink -f docker-compose.prod.yml run --rm --no-deps api \
  node scripts/production-entrypoint.mjs npx prisma migrate status

# Continue only after migration and aggregate checks have passed.
docker compose -p lilink -f docker-compose.prod.yml up -d --no-build api
```

容器 labels 已确认 Compose project=`lilink`、service=`api`；正式执行前复核 mount 路径及候选镜像 ID。停止 API 才能停掉其中的定时任务；只关闭浏览器入口不等于数据库停写。迁移一次性容器的默认命令已被覆盖，不会启动业务。正常 API 启动器仍会检查迁移并执行管理员 bootstrap。新 API 在维护期必须以 `RELEASE_MAINTENANCE=true`、`BACKGROUND_JOBS_ENABLED=false`、`MAIL_DELIVERY_ENABLED=false` 启动，三个值写入受限的 secret 文件。只有健康检查及携带独立 `lilink_release_access` Cookie 的验收请求可以通过；Cookie 放行仍需要正常账号鉴权。维护模式同时阻止周期调度、保留任务、邮件轮询和内联发信。核验任务与 outbox 未变化后，先恢复访问，再按发布记录逐项恢复后台与邮件。

随后依次完成：

1. 从内网验证 API health、数据库版本、关键只读接口和授权测试账号流程。核对旧快照重建速度；缓存预热/同步使用经验证的受限运维路径，当前仓库没有现成的全量预热 CLI，不臆造命令。
2. Vercel 将已验证的 production staged deployment 分配给正式域名。可用 `vercel deploy --prod --skip-domain` 准备，再 `vercel promote <staged-production-url>` 切换；项目关联及部署身份恢复后执行。不要把携带隔离 API 地址的 Preview 直接作为正式产物。
3. 在维护放行范围内验证 `lilink.top` / `www.lilink.top`：旧会话登录、新问卷空白与重新填写/刷新保持、每轮报名、VIP 规则、未重填时最近三轮仍可读及联系方式权限、注销后旧令牌失效；合成测试留在隔离环境，生产验收账号须明确指定。
4. 先开放少量受控访问，核对错误率、延迟、数据库连接、邮件积压和浏览器端 CORS/Cookie，再全面开放。实际发送邮件到外部收件人须有明确验收范围。

不能先切新版前端：新版首页依赖 `/me/bootstrap` 等新 API。前后端混用可能出现登录后回登录页等现象，静态首页成功不足以证明兼容。

### 4.3 回滚与停止条件

迁移失败、敏感信息越权、原始业务记录异常丢失、VIP/报名权限错误、关键流程失败，均保持维护状态并停止切流。

- **尚未迁移**：取消发布，保留原 API 镜像与原 Vercel deployment。
- **已迁移且尚未接受第一笔新写入**：优先修复；需要整体回滚时，从停写点恢复到独立数据库分支，核验后同步恢复连接串、旧 API 镜像和旧 Vercel deployment。不要直接对原生产分支做 reset。
- **已经接受第一笔新写入（包含维护放行验收）**：直接恢复旧数据库会丢失此后的新数据。立即停写、记录新增写入并选择前向修复或经确认的数据合并恢复；不能承诺一键无损回滚。
- 只回滚 API/前端不撤销问卷版本、同意状态或联系方式授权。旧版对新增数据/枚举的兼容性需在演练中验证，未验证时不采用只回镜像方案。

计划目标：第一笔新写入前，从已核验停写备份恢复的 RPO=0、RTO≤30 分钟。生产验收中的问卷保存、报名、VIP 和注销均属于新写入；从第一笔开始记录时间、账号和操作，另保存后续备份。之后回退优先前向修复，必须保护全部新写入，不能把“未全面开放”作为无损恢复依据。

## 5. 压测计划

### 5.1 环境与数据

先沿用历史容量讨论的规划假设：2,000 个累计注册账号、500 人在 1 分钟内进入结果页；另测 1,000 人/分钟。当前新版首页服务端会并发请求 4 个 API，因此可先按约 33/67 req/s 建模，再以真实浏览器导航及 API 入口请求日志共同校正接口比例。首页与直接进入匹配页分别统计，SSR 请求不能仅靠浏览器 Network 推断。

压测使用独立 API 主机/容器与独立 Neon 分支，尽量匹配生产的 2 CPU、约 4 GiB 内存及 0.25–2 CU 配置；压测机独立，不能同生产 API 抢资源。远端测试 endpoint 必须显式白名单并校验分支 ID，拒绝生产 endpoint；本机测试沿用 `127.0.0.1`、非 5432、`lilink_e2e_*` 数据库限制。

新建只有 schema 和合成数据的压测库：2,000 个账号、不同学校/性别/意向分布、242 份旧问卷形态的回归子集，以及已揭晓/待揭晓/未报名/举报屏蔽/VIP有效与失效等样本。需要进入真实撮合池的合成用户在**确认隔离库后**使用正常参与标记，不能全部设为 `isTest=true` 导致被业务过滤而得到虚假容量。所有邮箱使用测试地址，邮件只进入 Mailpit，移除生产 SMTP 与分析平台凭据。

### 5.2 场景与负载

| 场景 | 初始负载与时长 | 业务断言 |
| --- | --- | --- |
| 冒烟与冷启动 | 1–5 虚拟用户；Neon 自然挂起后第一次访问，再测热态 | 能登录、读取并保存；冷/热延迟分开报告 |
| 公开页 | 10→25→50 req/s，每档 2 分钟 | landing、schools、questionnaire 有正确响应，不只测缓存页面 |
| 揭晓集中访问 | 已登录不同用户；33→67→100 API req/s，每档 2 分钟 | bootstrap、问卷、联系方式及结果业务内容正确；至少覆盖 500 人批量进入 |
| 短突发 | 200 API req/s，30 秒 | 恢复到正常延迟、无持续连接积压；这是余量探测，不是承诺 |
| 读写混合 | 70% 首页/结果读，20% 资料/问卷保存，10% 报名或 VIP 操作；50→100 req/s，每档 5 分钟 | 刷新后写入存在、重复请求幂等、预期拒绝与系统失败分开 |
| 撮合准备与揭晓 | 500/1,000/2,000 个已报名用户；同时保持 33 req/s 浏览流量 | 不重复配对/授权/入队；计时分为候选生成、Blossom、事务、快照、邮件队列排空 |
| 缺快照与重试 | 仅在隔离库制造快照缺失；67 req/s；模拟单次失败及双请求揭晓 | 缓存补建不越权，无重复结果邮件；恢复后 UI 为正确终态 |
| 持续运行 | 33 req/s，30 分钟 | 无持续内存增长、数据库连接泄漏、积压持续增长 |

额外覆盖 VIP 激活并发、活动容量竞争、同一用户并发修改联系方式/报名、注销或屏蔽与揭晓竞争。鉴权会话预先创建，正常负载使用不同用户并保留真实限流配置。`/me/*` 以验证过签名的用户会话分桶，公开鉴权与兑换继续按来源 IP；不伪造来源 IP。正常用户遇到的 429 纳入业务失败，另外验证真实限流边界。

### 5.3 通过标准与停止阈值（建议值）

- 正常场景要求 `dropped_iterations=0`，实际完成请求数达到计划请求数的 99.5%，业务成功用户数达到各场景目标；逐接口记录实际到达率、完成率和成功率。延迟达标而负载未达成不能通过。
- 热态核心读取 p95≤800 ms、p99≤2 s；写入 p95≤1.5 s；正常场景意外 5xx/超时<0.5%。冷启动单列，浏览器结果页可用 p95≤3 s。
- 2,000 人撮合准备目标≤60 秒；揭晓事务必须小于代码中的 30 秒 timeout，目标≤10 秒；结果快照覆盖与队列排空单独计时。调度器每 5 分钟检查一次，另有最多约 5 分钟触发等待，不能混入或掩盖执行耗时。
- 配对唯一性、权限、同意、幂等性和记录保存必须 100% 正确；一条越权或重复发信即不通过。Mailpit 接收成功不等于外部邮箱投递成功。
- 记录 CPU、RSS、event-loop delay、容器重启、DB 活跃/等待连接、锁等待、慢查询、快照完成率和 outbox 积压。当前服务未证实已有全部指标；跑压测前补齐最小采集。
- 任一数据错误立即停止；5xx/超时超过 2% 持续 30 秒、RSS 超过隔离容器限制 85%、出现 OOM/重启、DB 等待持续累积时终止加压，保存证据并清理测试资源。

初版审计时撮合在 API 主线程调用 Blossom；演练证实阻塞后，候选已移入独立 worker，并改用批量事务写入及顺序完成快照/邮件领取。详见执行记录；计算微基准仍不能替代完整用户请求与数据库压测。

### 5.4 工具与交付

旧 `loadtest/stage*.js`、`seed-test-users.sh`、`cleanup-test-users.sh`、`staging-up.sh`、`staging-down.sh` 已退役并直接拒绝执行。新入口在 `scripts/release/`，必须提供经 Neon 分支和 compute 元数据核对的目标清单，不使用生产默认值，不复用生产 SMTP 或同机 staging。

浏览器业务路径继续用仓库现有 Node.js + Playwright；协议层压测建议使用 k6 的恒定到达率模式，分别标记 API 与页面导航，避免固定虚拟用户在系统变慢时自动降低发压掩盖瓶颈。测试应走隔离的 Vercel→API 链路验证端到端体验，也应直接压隔离 API 定位服务容量；不能用前端 CDN 命中率代替数据库容量。

压测执行前产出可复跑脚本、合成数据生成与清理脚本、目标库硬校验、资源上限/费用边界。执行后交付提交 SHA、配置、数据规模、实际请求率、p50/p95/p99、错误分类、业务断言、资源曲线、瓶颈与清理结果。已有独立 Linux、Mac 容器计算和低负载检查，完整容量门槛尚未通过；实际结果以执行记录为准。

## 6. 发布前尚需完成

1. 恢复 Vercel 发布身份并核对生产项目配置；选定隔离测试资源与维护窗口。
2. 实施旧答卷独立归档、全部用户空白新版、当前版本完整报名/撮合校验和历史卡片资料保留；处理新问卷自身的 VIP 偏好与最低分契约。重新固定候选与迁移清单，完成生产形态迁移、真实用户链路、schema 核验及恢复演练。
3. 按上述负载模型完成压测，确定实际容量与停机时间。
4. 准备维护路由、备份、带 SHA 的镜像和 staged production 前端，再按明确发布授权执行生产切换。

本次文档之外的源码、线上设置及生产数据均未改动。Git 删除触发仓库 pre-push lint：0 errors、5 个既有 warnings，随后核对无源码 diff。上述检查不是一次新部署验收。

## 7. 证据与参考

- [候选 CI](https://github.com/LiLink-Campus/LiLink/actions/runs/35501688180)、[候选 Browser E2E](https://github.com/LiLink-Campus/LiLink/actions/runs/35501688160)、[同 SHA Storybook](https://github.com/LiLink-Campus/LiLink/actions/runs/35501143646)。
- [当前正式前端部署](https://vercel.com/zyy2740738166-7111s-projects/lilink/4Q4qwqEQQ3BGwCEdWkSPwzAujTCg)、[候选预览部署](https://vercel.com/zyy2740738166-7111s-projects/lilink/A8EYnxh7tyonamYRQEGNtZyydoEu)。
- 现场数据来自 Neon 只读事务、Vercel deployment/alias 查询、SSH 容器 release/资源/挂载配置核验；聚合原始证据和只读预检 SQL 在本地 Git 忽略目录 `artifacts/release-audit-20260920/`，不含用户明细或 secret。
- 实现依据：[生产入口](../apps/api/scripts/production-entrypoint.mjs)、[生产 Compose](../docker-compose.prod.yml)、[Prisma 配置](../apps/api/prisma.config.ts)、[迁移目录](../apps/api/prisma/migrations/)、[周期服务](../apps/api/src/modules/cycles/cycles.service.ts)。
- [Vercel staged production 与域名切换](https://vercel.com/docs/deployments/promoting-a-deployment)、[CLI --skip-domain](https://vercel.com/docs/cli/deploy)、[Prisma 7 生产迁移约束](https://github.com/prisma/web/blob/main/apps/docs/content/docs/orm/v7/more/best-practices.mdx)。平台说明以官方现行文档核验；具体命令仍固定本仓库版本。
