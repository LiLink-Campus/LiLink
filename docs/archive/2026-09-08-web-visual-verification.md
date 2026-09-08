> 归档说明：历史参考资料，不作为当前 Agent 执行指令；现行行为以代码和 AGENTS.md 为准。
> 来源提交：`a6b1bf4abd4e230be348e7f9316ba7c3b5f54190`；原文件：`docs/web-visual-verification.md`。
> 日期前缀按文档形成时间命名；拓扑快照使用对应修订日期。归档时更新了文档链接，其余保留源版本内容。

# Web Visual Verification

Use browser evidence for the affected states of a UI change. Storybook fixtures must be synthetic. Add `tags: ["smoke"]` to representative regression states.

## Targeted Evidence

Build Storybook, then capture only the changed stories by ID or title substring:

```sh
npm run build-storybook:web
STORYBOOK_SCREENSHOT_STORIES='<id-or-title-substrings>' npm run screenshots:storybook:web
```

The screenshot selector is comma-separated and overrides the default smoke-tag filter. It scopes screenshots, not the Storybook test suite. Inspect the resulting images for layout, content, and state correctness. For interactions that need the running app, verify the actual page flow as well.

For shared UI changes that warrant the complete smoke suite, run `npm run visual:storybook:web`. This builds Storybook, runs smoke tests, and captures screenshots. The `Storybook Visual Evidence` GitHub Actions workflow also produces evidence artifacts when relevant changes are detected.

## Publishing to a PR

When the task authorizes updating a PR, post the targeted captures with:

```sh
npm run evidence:storybook:web -- --pr <number>
```

This pushes a `storybook-evidence/pr-<number>` branch and creates or updates a sticky PR comment containing images linked by commit SHA. Review captures before publishing and keep the comment scoped to the changed states. Otherwise, retain the captures locally for review.

Do not commit generated screenshots or `storybook-static` to application branches. If local checks are blocked, report the missing prerequisite and inspect available CI artifacts without treating missing evidence as a successful check.
