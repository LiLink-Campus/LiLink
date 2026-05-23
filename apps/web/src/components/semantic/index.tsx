import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Tone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type StatusSignalProps = ComponentPropsWithoutRef<"span"> & {
  tone?: Tone;
  dot?: boolean;
};

export function StatusSignal({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: StatusSignalProps) {
  return (
    <span
      className={cx("semantic-status", `semantic-status--${tone}`, className)}
      {...props}
    >
      {dot ? <span className="semantic-status__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type UnreadDotProps = ComponentPropsWithoutRef<"span">;

export function UnreadDot({ className, ...props }: UnreadDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cx("semantic-unread-dot", className)}
      {...props}
    />
  );
}

export type UnreadBadgeProps = ComponentPropsWithoutRef<"span"> & {
  count?: number;
};

export function UnreadBadge({
  count,
  className,
  children,
  ...props
}: UnreadBadgeProps) {
  const label = children ?? (typeof count === "number" && count > 99 ? "99+" : count);

  return (
    <span className={cx("semantic-unread-badge", className)} {...props}>
      {label}
    </span>
  );
}

export type SectionHeaderProps = ComponentPropsWithoutRef<"header"> & {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  count?: ReactNode;
};

export function SectionHeader({
  eyebrow,
  title,
  body,
  actions,
  count,
  className,
  ...props
}: SectionHeaderProps) {
  return (
    <header className={cx("semantic-section-header", className)} {...props}>
      <div className="semantic-section-header__main">
        {eyebrow ? (
          <p className="semantic-section-header__eyebrow">{eyebrow}</p>
        ) : null}
        <h2 className="semantic-section-header__title">{title}</h2>
        {body ? <p className="semantic-section-header__body">{body}</p> : null}
      </div>
      {actions || count ? (
        <div className="semantic-section-header__aside">
          {count}
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export type EmptyStateProps = ComponentPropsWithoutRef<"div"> & {
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
};

export function EmptyState({
  icon,
  title,
  body,
  actions,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cx("semantic-empty-state", className)} {...props}>
      {icon ? <div className="semantic-empty-state__icon">{icon}</div> : null}
      <h3 className="semantic-empty-state__title">{title}</h3>
      {body ? <p className="semantic-empty-state__body">{body}</p> : null}
      {actions}
    </div>
  );
}

export type ActionGroupProps = ComponentPropsWithoutRef<"div">;

export function ActionGroup({ className, ...props }: ActionGroupProps) {
  return <div className={cx("semantic-action-group", className)} {...props} />;
}

export type NoticeProps = ComponentPropsWithoutRef<"p"> & {
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
};

export function Notice({ tone = "neutral", className, ...props }: NoticeProps) {
  return (
    <p
      className={cx("semantic-notice", `semantic-notice--${tone}`, className)}
      {...props}
    />
  );
}
