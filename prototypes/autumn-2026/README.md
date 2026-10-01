---
kind: readme
lang: zh
---

# 秋季视觉设计副本

> 文档归属：[原型入口](../README.md)。

## 职责与效力

本副本保留秋季设计阶段的 Web 源码和配套素材，不与正式 `apps/web` 同步。注册、登录及匹配状态使用开发专用合成预览，不代表真实账号或数据库操作；生产构建禁用预览。

开发过程见 [秋季记录](../../docs/records/autumn-2026/README.md)，设计选择见 [秋季决策](../../docs/decisions/autumn-2026/README.md)。历史源提交和初始复制记录保留在这些页面中。

## 启动与验证

从仓库根目录运行：

```sh
node prototypes/autumn-2026/start.mjs
```

启动器先构建 shared，随后以 webpack 在 loopback 3101 启动副本。依赖复用已有安装；根解析与共享包相对路径随目录深度保持一致。打开 `http://127.0.0.1:3101/`，使用右下角视觉预览入口查看合成状态。

可重复验收命令是 `npm run docs:prototype:verify`，输出浏览器/视口、合成数据前提、断言和截图。命令自行创建无环境文件的源码副本和随机 loopback 服务，结束时回收自身进程与副本；无需预先启动 3101 服务。浏览器请求与服务端 fetch 分别检查，真实 API、数据库和更新日志站点不参与验收。修复依据见 [隔离修复记录](../../docs/validation/2026-10-01-documentation-review-fixes.md)。

共享包兼容性与浏览器日期差异由 [原型维护任务](../../docs/plans/open-questions.md#原型维护任务) 跟踪；具体可用性与构建验证范围查 [有日期的验收记录](../../docs/records/2026-10-01-documentation-reorganization.md)。

## 素材与命名

`web/` 保留副本；其他图片与设计参考保留来源文件名和内容哈希。素材更新记录来源与用途，决策正文写入 docs。预览页面、加载反馈与交互按实际结果验收，不以 HTTP 成功代替。
