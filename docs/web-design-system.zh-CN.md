# LiLink Web 设计系统边界

Stage 1 的目标是建立边界，而不是重新设计业务页面。`apps/web` 的样式分四层：

- Tokens：`apps/web/src/styles/tokens.css`，只放语义 CSS 变量。
- Primitives：`apps/web/src/components/ui/` 和 `apps/web/src/styles/primitives.css`，放按钮、卡片、表单控件、徽标、布局等低层 UI。
- Semantic UI：`apps/web/src/components/semantic/` 和 `apps/web/src/styles/semantic.css`，放状态信号、未读信号、区块标题、空状态、动作行和上下文提示。
- Feature components：业务组件只能组合 primitives 和 semantic UI；不要在业务 CSS 里重新定义按钮、徽标、输入框或卡片。

## Tokens

全局 token 使用语义名：

- 页面和容器：`--color-canvas`、`--color-surface`、`--color-surface-muted`、`--color-surface-tinted`、`--color-overlay`
- 文本：`--color-text`、`--color-text-secondary`、`--color-text-muted`、`--color-text-on-brand`
- 边框和焦点：`--color-border`、`--color-border-strong`、`--color-border-hover`、`--color-focus`
- 品牌和强调：`--color-brand`、`--color-brand-hover`、`--color-brand-soft`、`--color-brand-tint`、`--color-brand-ink`、`--color-accent`
- 状态：`--color-success`、`--color-warning`、`--color-danger` 及其 `-soft` 变体

旧 token 禁止使用或重新引入：`--bg`、`--fg`、`--primary`、`--border`、`--accent`、`--success`、`--warning` 及其旧变体。

## Primitive APIs

从 `@/components/ui` 引入：

```tsx
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FormMessage,
  Input,
  Inline,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  Stack,
  Textarea,
} from "@/components/ui";
```

常用示例：

```tsx
<Button variant="secondary" size="sm">刷新</Button>
<Button size="lg" shape="rounded" elevation="flat">核销</Button>
<ButtonLink href="/dashboard">开始匹配</ButtonLink>

<Card layout="plain">
  <CardHeader>
    <CardTitle>方案明细</CardTitle>
    <Badge tone="brand">北京时间</Badge>
  </CardHeader>
  <CardDescription>补充说明文字。</CardDescription>
</Card>

<Field label="学校邮箱">
  <Input type="email" autoComplete="email" />
</Field>
<Input controlSize="lg" radius="sm" border="subtle" />

<FormMessage tone="error">保存失败，请重试。</FormMessage>
```

`Card` 默认是纵向 stack 卡片；从旧 block-flow 面板迁移时用
`layout="plain"`，避免 primitive 引入额外子元素间距。`padding="spacious"`
和 `elevation="md"` 只用于需要保留旧大卡片视觉的页面。`Button` 的
`shape="rounded"`、`elevation="flat"` 和 `Input` 的 `border="subtle"`
用于保留既有产品控制样式，不要在业务 CSS 里重新定义按钮或输入框根样式。

## Semantic APIs

从 `@/components/semantic` 引入：

```tsx
import {
  ActionGroup,
  EmptyState,
  Notice,
  SectionHeader,
  StatusSignal,
  UnreadBadge,
  UnreadDot,
} from "@/components/semantic";
```

语义组件只表达复用概念，不拥有业务状态：

```tsx
<StatusSignal tone="success" dot>已开启</StatusSignal>
<UnreadDot />
<UnreadBadge count={3} />

<SectionHeader
  eyebrow="Weekly Match"
  title="过往匹配"
  body="查看历史轮次和联系状态。"
  actions={<Button variant="secondary">刷新</Button>}
/>

<EmptyState title="暂无数据" body="完成筛选后会在这里显示结果。" />

<ActionGroup>
  <Button>保存</Button>
  <Button variant="secondary">取消</Button>
</ActionGroup>

<Notice tone="warning">该操作会影响当前轮次。</Notice>
```

`UnreadDot` 和 `UnreadBadge` 在 Stage 1 只是视觉信号，不引入通知存储、已读接口或 mark-as-read 行为。

## Banned Patterns

TS/TSX 里禁止旧 primitive class：

- `button-*`
- `content-panel`
- `app-card` / `app-card-*`
- `auth-form`
- `form-error`
- `form-success`
- `domain-chip`
- `admin-tab` / `admin-tab-*`
- `mc-btn` / `mc-btn-*`
- `mc-input` / `mc-input-*`
- `mc-card` / `mc-card-*`

CSS 里禁止旧 token 定义或 `var(...)` 引用：

- `--bg*`
- `--fg*`
- `--primary*`
- `--border*`
- `--accent*`
- `--success*`
- `--warning*`

业务 CSS 也不能在文件根部重新定义 `.ui-*` 或 `.semantic-*` 选择器。需要调整 primitive/semantic 行为时，改 `apps/web/src/styles/primitives.css` 或 `apps/web/src/styles/semantic.css`；业务文件只能写类似 `.feature-row .ui-button { ... }` 的局部组合规则。

业务 CSS 可以保留 layout 或产品表达，例如 app shell、admin table、dashboard flow card、meetup negotiation layout、merchant result display。只要某个样式在多个页面充当按钮、badge、input、card、empty state、status pill 或 action row，就应提升到 primitive 或 semantic layer。

## Audit

运行：

```sh
npm run lint:web-boundary
```

脚本会扫描：

- TS/TSX 字符串字面量中的 banned primitive class。
- CSS custom property 定义和 `var(...)` 引用中的 banned legacy token。
- 业务 CSS 文件根部重新定义 `.ui-*` / `.semantic-*` design-system selector。

脚本忽略 `node_modules`、`.next`、`dist`、`build`、`out`、`coverage`、`.turbo`、`.vercel` 和 `docs`。
