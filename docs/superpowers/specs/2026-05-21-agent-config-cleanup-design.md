# Agent 配置整理与统一 — 设计文档

- 日期：2026-05-21
- 状态：已批准，待实现
- 范围：仓库内所有 Agent（Codex / Cursor / Claude Code）的规则、Hooks、Skills 配置整理

## 1. 背景与问题

仓库由 Codex、Cursor 先后参与构建，现在加入 Claude Code。当前配置存在以下问题：

- **规则**：已统一。`AGENTS.md` 是唯一真源，`CLAUDE.md` 通过 `@AGENTS.md` 导入；Codex/Cursor 原生读 `AGENTS.md`。**这一层无需改动。**
- **Hooks**：半统一。`scripts/hooks/registry.mjs` 是真源，`npm run hooks:sync` 生成 `.codex/hooks.json`、`.cursor/hooks.json`。**但 Claude 没有接入**——没有 `.claude/settings.json`，Claude 拿不到那个 web CSS 校验 hook。
- **Skills**：散乱。两个个人技能 `lilink-local-ops`、`lilink-ssh-environment` 放在 `.codex-local/skills/`，这是**非约定路径**（带 `-local` 后缀），Codex/Claude 都不会自动发现它。
- **杂物**：`.codex/hooks/`、`.codex/tmp/`、`.cursor/hooks/` 空目录；`.codex-local/` 下大量历史 scratch（probes、verify-*、`.superpowers` 残留、visual-companion、repro 等）。

## 2. 已确认的事实（实测）

- Codex CLI 0.132.0 从三个作用域发现 skill：内置、用户级 `~/.codex/skills/`、**项目级 `{cwd}/.codex/skills/`**，并**跟随软链接**扫描。
  （来源：https://developers.openai.com/codex/skills 、 https://developers.openai.com/codex/concepts/customization ）
- Claude Code 从项目级 `.claude/skills/<name>/SKILL.md` 发现技能，同样跟随软链接。
- SKILL.md 的 frontmatter 格式（`name` / `description`）对 Codex 与 Claude 通用，技能内容可移植；差异仅在发现位置。
- `.codex-local/` 全程 gitignored；`.codex/hooks.json`、`.cursor/hooks.json` 已被 Git 跟踪；空目录未被跟踪。
- `.codex-local` 在仓库内仅 4 处引用：`.gitignore`、`AGENTS.md`（git-hygiene 列表）、`SKILL.md`、`local_ops.mjs`。

## 3. 目标与非目标

### 目标
1. 把 Claude 接入统一 Hook 体系（与 Codex/Cursor 同构）。
2. 统一个人 Skills：**单一中性源 + 项目级软链**，让 Codex 与 Claude 都能发现，且不污染全局 `~/.codex`。
3. 清理杂物：删除 scratch、空目录；把 `.codex-local` 改名为中性的 `.agent-local`。
4. 文档极简：仅在 `AGENTS.md` 记录 hook/skill 的注册机制；个人内容保持 gitignored、不强加给协作者。

### 非目标
- 不改 `AGENTS.md` 既有规则内容。
- 不把个人技能提交进 Git / 不做团队共享技能。
- 不为 Cursor 造技能系统（Cursor 无 SKILL.md 机制，只读 `.cursor/rules` 与 `AGENTS.md`）。

## 4. 目标分层模型

```
① 共享 · 入 Git（团队）
   AGENTS.md                      规则唯一真源（Codex/Cursor/Claude 都读）
   CLAUDE.md  → @AGENTS.md
   scripts/hooks/registry.mjs     Hook 唯一真源
        ├─ .codex/hooks.json      （生成·入 Git）
        ├─ .cursor/hooks.json     （生成·入 Git）
        └─ .claude/settings.json  （生成·入 Git）★新增
   scripts/web-css-syntax.mjs     共享校验逻辑（+ Claude 适配函数 ★）
   scripts/hooks/*-validate-*.mjs 各工具薄适配器（+ Claude ★）
   scripts/agent-skills-link.mjs  Skills 软链器 ★新增（机制入 Git）

② 个人 · gitignored（仅本人）
   .agent-local/skills/<name>/    技能唯一源（由 .codex-local/skills 迁移）★
   .codex/skills/<name>           软链 → ../../.agent-local/skills/<name> ★
   .claude/skills/<name>          软链 → ../../.agent-local/skills/<name> ★
   .claude/settings.local.json    个人 Claude 设置
   AGENTS.override.md             个人规则覆盖
```

边界说明：**规则三家统一**（靠 `AGENTS.md`）；**技能两家统一**（Codex + Claude，靠单源 + 软链）。

## 5. 详细改动

### 5.1 Hooks —— Claude 接入

- `scripts/hooks/registry.mjs`：向 `AGENT_HOOK_CONFIG_FILES` 增加第三个条目：
  - `tool: "claude"`，`path: ".claude/settings.json"`
  - `config`：`{ hooks: { PostToolUse: [{ matcher: "Write|Edit|MultiEdit", hooks: [{ type: "command", command: <repoRootNodeHookCommand("scripts/hooks/claude-post-validate-web-css.mjs")> }] }] } }`
- 新增 `scripts/hooks/claude-post-validate-web-css.mjs`：薄适配器，读 stdin JSON，调用 `validateClaudePostToolUse`。
- `scripts/web-css-syntax.mjs`：新增 `validateClaudePostToolUse(payload, repoRoot)`：
  - 取 `tool_name`（Write/Edit/MultiEdit）与 `tool_input.file_path`。
  - 若该文件是 `apps/web/**.css`（复用 `isWebAppCss`），从磁盘读取（PostToolUse 时文件已写入）并用 `validateFile` 校验。
  - 失败时返回 `{ ok:false, hookStdout:{ decision:"block", reason, hookSpecificOutput:{ hookEventName:"PostToolUse", additionalContext } } }`，适配器打印 JSON 并 `exit 2`（与 Codex 的 PostToolUse 输出契约一致）。
  - 成功 `exit 0`。
- `scripts/hooks/hook-registry.test.mjs`：补充对 Claude 条目（path/matcher/command）的断言。
- 约定：`.claude/settings.json` 为**生成文件**，禁止手改；个人设置写入 `.claude/settings.local.json`。当前仓库无该文件，不存在覆盖风险。

> `sync-hook-configs.mjs`、`audit-hook-configs.mjs`、`install-git-hooks.mjs` 均遍历 `AGENT_HOOK_CONFIG_FILES`，新增条目后自动覆盖，无需改动它们。

### 5.2 Skills —— 单源 + 项目级软链

- 迁移：`.codex-local/skills/*` → `.agent-local/skills/*`（保持 gitignored）。
- 新增 `scripts/agent-skills-link.mjs` + package.json 脚本 `"skills:link"`：
  - 扫描 `.agent-local/skills/*` 下每个技能目录。
  - 为每个技能在 `.codex/skills/<name>` 与 `.claude/skills/<name>` 创建相对软链 `../../.agent-local/skills/<name>`。
  - 幂等：链接正确则跳过；链接错误/失效则重建；目标是真实目录（非软链）则告警并跳过，不覆盖。
  - 找不到 `.agent-local/skills` 时安静 no-op（协作者无该目录时不报错）。
- 内部路径引用更新（`.codex-local` → `.agent-local`）：
  - `.agent-local/skills/lilink-local-ops/SKILL.md`（第 17、40 行）
  - `.agent-local/skills/lilink-local-ops/scripts/local_ops.mjs`（第 16 行的本地路径数组）

### 5.3 清理

- 删除 `.codex-local/` 下除 `skills/` 外的全部内容（已逐组确认：陈旧会话状态、verify/repro 脚本、DB 探针 + 旧 CSS、游离 test、typegen 脚本、cursor 自动化笔记）。
- 删除空目录：`.codex/hooks/`、`.codex/tmp/`、`.cursor/hooks/`。
- 重命名 `.codex-local` → `.agent-local`（实际操作：迁移 `skills/` 后删除旧目录）。

### 5.4 `.gitignore`

```
# 改：
.codex-local/   →   .agent-local/
# 增：
.codex/skills/
.claude/skills/
.claude/settings.local.json
# 保持被跟踪（勿忽略）：.codex/hooks.json · .cursor/hooks.json · .claude/settings.json
```

### 5.5 `AGENTS.md`（仅此一处文档改动）

- **Hook Management** 小节：说明现在覆盖 Codex/Cursor/**Claude** 三家；如何注册新 hook（在 `registry.mjs` 增条目 → `npm run hooks:sync`）。
- 新增 **Skills** 小节（简短）：个人技能放 `.agent-local/skills/`（gitignored），`npm run skills:link` 生成 `.codex/skills`、`.claude/skills` 项目级软链；技能为个人本地、不入 Git。
- git-hygiene 列表：`.codex-local/` → `.agent-local/`，并补 `.claude/settings.local.json`、`.codex/skills/`、`.claude/skills/`。

## 6. 验证

- `npm run hooks:audit` 通过（含新增 Claude 条目）。
- `npm run test:hooks` 通过（registry 测试含 Claude 断言）。
- `npm run skills:link` 生成正确软链；确认 Codex/Claude 能发现迁移后的技能（实测）。
- 故意在某 `apps/web/*.css` 引入语法错误，确认 Claude 的 PostToolUse hook 能拦截并反馈；正确 CSS 不误伤。
- 动 Git 前完整 `git diff` 复核。

## 7. 实现顺序（概要）

1. 提交本设计文档。
2. 产出分步实现计划（writing-plans）。
3. 按步实现，每步给出 diff 供复核；最后跑验证。
