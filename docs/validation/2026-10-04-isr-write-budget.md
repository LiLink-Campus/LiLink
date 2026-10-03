---
kind: changelog
lang: zh
---

# On-demand Revalidation 的 ISR Writes 专项验收

> 文档归属：[验收记录](README.md)。

> 历史方案提示：本文记录旧候选的原始行为和工件，已被[仅使用 Vercel 的 ISR 验收](2026-10-04-vercel-only-isr.md)所描述的新实现取代。旧版本没有持久化 revision 领取去重，合并窗口及浏览器刷新方式也不同；不得将以下数据解释为当前实现的结果。文中的 `--no-static-cdn` 仅是历史运行参数，当前 runner 已删除该参数和独立静态 CDN 路径，所有资源默认同源 Vercel。

本次专门补齐“按需失效是否降低实际再生成频率，以及每月 50,000 PV 是否能留出 20% ISR Writes 额度”的证据。前面的 49,191、50,342.4 与 69,513.6 均是附条件模型结果，不是已部署候选的 Vercel 账单。

## 本地测得的行为

使用未配置独立静态 CDN 的生产构建，隔离 PostgreSQL/Mailpit、合成账号、真实 Nest API、Next 16.3.5 和 Playwright Chromium 148.0.7778.96。通过后台 UI 修改轮次，走真实事务 trigger、dispatcher、HMAC 回调及首页访问。仅为缩短验收等待，将 disposable 队列的 dueAt/尝试时钟前移；产品 TTL 与合并间隔未修改，不能将此测试解释为已实际运行满 15 分钟或一个月。

首次专项工件：`artifacts/e2e/bf32f9a4677d/isr-write-evidence/evidence.json`。该专项通过，采集错误为 0；同次运行另一个既有故障用例失败，见下文验证记录，不能把整组称为全部通过。

| 阶段 | 观察结果 |
| --- | --- |
| 稳定快照连续 100 次访问，含 4 批 20 并发 | 全部 HIT；HTML hash 相同；被观察的 route/Data Cache 文件均无重写 |
| 后台真实修改成功，实际失效已确认；随后 6 秒不访问首页 | 无首页及 home Data Cache 文件重写 |
| 失效后 20 并发，再等待可见内容收敛 | 观察 1 轮首页 HTML/RSC/meta/3 个 segment 重写，以及 1 次 Data Cache 重写；最终 HIT |
| 同 revision 的合法通知连续重放 3 轮，每轮穿插访问 | 每轮都再次重写；没有接收端 revision 去重 |
| 首页浏览器验收 | 轮次时间、首页提示及底部说明与管理员修改一致，保存截图 |

重复通知产生的 HTML 每次 SHA-256 不同；仅归一化 `sentry-trace`/`baggage` 两个 meta 后，三轮 HTML 均与上一轮相同。RSC 和 Data Cache 业务内容相同，但仍观察到本地文件重写。**因此，“同一 revision”或“业务内容未变”不能作为线上零写入的预算前提。** Sentry 产品配置未修改。既有隔离 runner 使用空 DSN，仍观察到上述自动追踪元数据；测试没有向生产遥测服务发送事件。

采集使用 `fs.watch` 加 20 ms 文件采样，保留完整文件版本、mtime、原始/gzip 大小和内容 hash。操作系统通知可能合并，观察次数是本地文件版本的下界，不是精确函数调用或 Vercel 写入计数。本次没有观察到一次业务通知导致两轮重写；模型仍提供两轮再生成的压力情景。磁盘读写只用于缓存诊断，本次不进行网络性能比较。

构建清单确认，周期性 Full Route Cache 只有 `/` 和 `/api/devlog/latest`，均为 3600 秒。`/api/public/schools` 和 `/updates` 为动态路由；静态学校介绍 `/schools` 没有周期性再生成。完整清单和文件字节摘要一并保存在专项工件中。

## 大小与月度计算

首次专项观察到的完整版本最大 HTML 为 63,820 B，RSC 为 27,739 B，按每件 `ceil(bytes/8192)` 是 8 + 4 = **12 单位/轮**。首页其余本地 route 文件为 metadata 1 单位、page segment 4 单位、full segment 4 单位、tree segment 1 单位；将这些全部独立计入得到 **22 单位/轮**的更保守参考。full segment 与 RSC 有重复内容，本地 metadata/segments 是否被 Vercel 独立计费尚未验证，因此 22 不是声称平台真实收取 22 单位。

正常规划为 31 天、150 次部署、2,976 批普通变化及 124 批紧急变化，1 次成功处理/批、1 轮再生成/处理。首页生成机会为 `744 + 150 + 2976 + 124 = 3994`。额外保留本项目其他 ISR 写入 10,000 单位，再整体乘 1.2 不确定性系数；20% 免费额度余量另由 160,000 门禁保证，两个系数不互相替代。

`/api/devlog/latest` 的本地 body/meta 分别为 34/221 B；即使每小时及每次部署都按两件各 1 单位计，`(744+150)×2=1788` 单位也可容纳在 10,000 预留内。剩余预留用于其他未穷尽的访问、部署差异及异常；并不等于已验证所有预览部署和其他项目。

| 同条件模型 | 月 ISR Writes 单位 | Hobby 剩余比例 | 160,000 门禁 |
| --- | ---: | ---: | --- |
| 旧 30 秒策略，30,000 首页访问，同样按 12 单位/轮 | 444,000 | 已超额 | 失败 |
| 新 1 小时 + 按需，12 单位/轮 | 69,513.6 | 65.24% | 通过 |
| 新策略，全部本地 route 文件按 22 单位/轮 | 117,441.6 | 41.28% | 通过 |
| 新策略，每批实际失效 2 次，12 单位/轮 | 114,153.6 | 42.92% | 通过 |
| 新策略，每批实际失效 2 次，22 单位/轮 | 199,281.6 | 0.36% | 失败 |
| 新策略，每批 6 次均实际失效，12 单位/轮 | 292,713.6 | 已超额 | 失败 |

50,000 PV 中首页占 60% 时是 30,000 首页访问；全部 50,000 PV 都是首页时，新正常策略的 3,994 次机会仍未受请求数限制，以上两项新正常预测不变。旧策略在全首页情景按相同 12 单位会变成 732,000。原 492,000 使用的大小和页面组合不同，不作为本表的同口径基线。以上均假定每个生成机会都产生变化、均计入完整输出，没有使用重复内容抵扣。

在其他团队用量暂按项目边界排除、保持上述部署/预留/系数的条件下，12 单位口径容纳 **9,383 次实际失效/月**；22 单位口径容纳 **4,712 次/月**，约 152 次/天。后者扣除 2,976 批普通统计后，可容纳 1,736 次紧急或重复失效/月。它是有条件的算术容量，不是系统已实施的限流器；其他项目用量、更多活跃部署或每次再生成更大时必须重算。

**结论：正常规划下 ISR Writes 足够，静态资源保留 Vercel 也能在这一项留出超过 20% 余量；但当前实现不能无条件保证任意紧急变更及确认丢失重试下仍达标。** 确认前述风险后，应优先为总失效频率增加可审计预算约束或降低重复失效，再在部署获授权后对照 Vercel 实际写入增量校准压缩与存储条目口径。此次没有部署，不能把本地通过升级为账号账单验收通过。

## 计量边界

截至 2026-10-04，Hobby 包含 200,000 个 ISR 写入单位/月；要求保留至少 20% 时，预算线是 160,000。每单位按 8 KB 存储量计，不是一次访问，也不是一次通知。Vercel 自动压缩 ISR 写入；内容与前一版相同的再生成不产生新写单位。本地文件大小、gzip 与磁盘写入次数都不是平台账单，本文以未压缩输出逐件进位作压力参考，并保留平台验证缺口。[Hobby 额度](https://vercel.com/docs/plans/hobby)、[ISR 计量](https://vercel.com/docs/incremental-static-regeneration/limits-and-pricing)

Next 的 `unstable_cache`/缓存 `fetch` 属于 Data Cache。当前官方用量表将其 Reads/Writes 列为不计费，ISR 则单列计费。因此不能把 `home`、`schools` 和 devlog 的 Data Cache JSON 写入再加一份 ISR 成本。它们仍可能触发页面重新生成，故需要分别观察。[官方资源分类](https://vercel.com/docs/pricing/manage-and-optimize-usage#data-cache)

`revalidateTag(tag, 'max')` 标记 stale，由后续访问触发刷新；没有页面访问时，回调本身不立即重新生成该页面。[Next 官方行为](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)

## 业务频率与故障边界

- 普通统计变化合并 15 分钟，31 天连续有变化时规划 2,976 次；另预留轮次/学校紧急变化 124 次，合计 3,100 次/月。124 是工作负载假设，不是代码硬限制。
- 紧急变化首次等待 5 秒，数据库按 scope 保证两次投递尝试至少间隔 60 秒。不能将“普通统计 15 分钟”推广为全部失效的硬上限。
- 同一公开投影的 hash 没有变化时，发送端只确认版本，不发送失效。事务回滚也不会留下通知。
- 发送端最多尝试 6 次；Web 端只验证 revision 格式，没有持久去重。若已完成失效但确认响应丢失，重试可能再次失效。正常一次投递与全部尝试均到达 Web 的压力情形必须分别核算。
- 每小时 TTL 是漏通知后的刷新机会，和业务失效一起计入保守规划。预览部署、机器人、多个仍在服务的部署及团队其他项目需要额外预算；50,000 PV 本身不限制这些活动。

现行行为维护于[公开缓存契约](../reference/public-data-cache.md)；全资源预算维护于[Hobby 预算方案](../plans/2026-10-03-vercel-hobby-budget.md)。独立静态 CDN 不改变本次失效调度次数，不能修复重复回调造成的再生成；判断 ISR 是否足够无需以迁移 Cloudflare 为前提。

## 复现与验证记录

需要 Node 24、npm 11、Docker、已安装依赖和 Playwright Chromium。必须通过项目 runner 运行；它复制当前未提交源码，启动 loopback disposable 服务，并自动销毁本次服务和数据库。没有使用开发或生产数据库。

```sh
node scripts/e2e/run.mjs --no-static-cdn home-cache-stability.spec.ts isr-write-budget.spec.ts --project=chromium --workers=1
node scripts/usage/isr-write-budget.mjs scripts/usage/isr-write-50000pv.scenario.json --output artifacts/usage/isr-write-budget/report.json --check-project
node scripts/usage/verify-isr-write-budget.mjs
npm run docs:check
npm run docs:verify
```

专项计算输入和 CLI 分别是 [isr-write-50000pv.scenario.json](../../scripts/usage/isr-write-50000pv.scenario.json)、[isr-write-budget.mjs](../../scripts/usage/isr-write-budget.mjs)。脚本输出正常投递、1/2/3/6 次实际处理、输出单位翻倍、通知翻倍和每次失效两轮再生成的敏感性，以及项目与账号门禁；不是把所有压力情景要求同时通过。默认项目门禁通过，改用 `--check-account` 退出 1，因为其他团队未来 ISR Writes 未知；报告始终声明 `billingVerified: false`。本地 gzip 的 3 单位情景仅为对照，不用于承诺平台账单。

测算 CLI 的失败边界先于实现列出并运行，保留实现前工件 `artifacts/usage/isr-write-cli-before/`。最终 23 个真实 CLI 子进程场景通过，覆盖逐输出进位、负数/缺值拒绝、未知团队不可当零、明确超额失败及压力情景输出；工件为 `artifacts/usage/isr-write-cli-verification/report.json`。这验证的是计算器行为，不是线上月用量。

首次 E2E `bf32f9a4677d` 为 **5 通过、1 失败**，其中新增 ISR 专项通过。失败的既有上游故障用例没有先收敛基线：trace 显示其第一次 GET 已为 STALE，7 ms 后发送新失效、再 5 ms 后发下一次 GET，先前在途 SWR 与故障阶段交叠，未出现用例要求的真实上游超时日志。因此该次失败不能宣称已验收“真实故障下保旧”。修正测试为暂停 API 前取得连续 HIT、同 HTML hash 及缓存文件静默；产品缓存逻辑未改。保留原失败 trace，按相同顺序复跑六项，验证顺序污染修复。

修正后同序运行 `30c770d20e71` **6/6 通过，exit 0**，用例执行约 1.1 分钟。故障用例实际观察到上游超时，验证旧快照保留及 API 恢复；新增写入专项重复取得上述结论，采集错误为 0。原始结果、截图、前后缓存版本与环境参数在 `artifacts/e2e/30c770d20e71/`，重点为 `results.json`、`run.json`、`isr-write-evidence/evidence.json` 和 `outage-converged-baseline` 附件。两轮均完成 runner 自动清理。测算输入固定引用首次已通过的专项字节证据，避免覆盖历史测量。

`docs:check`、`docs:verify` 和 `git diff --check` 通过；142 份文档索引、0 条稳定诊断。唯一 preview 提示来自既有性能文档“不允许用更快的错误页获得性能通过”的验收规则，人工复核属于行为门禁，无需伪造测量。Sentry wrapper 与相关配置/初始化文件逐一对照 Git HEAD 未变，证据为 `artifacts/usage/isr-write-budget/sentry-invariant.json`。此次未 commit、push 或部署；线上账单、多个 Vercel 实例/地域及完整月周期未实测。
