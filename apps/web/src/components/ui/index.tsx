import Link from "next/link";
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "lg";
type ButtonShape = "pill" | "rounded";
type ButtonElevation = "raised" | "flat";
type CardPadding = "md" | "compact" | "flush" | "spacious";
type CardLayout = "stack" | "plain";
type CardElevation = "sm" | "md";
type ControlSize = "md" | "lg";
type ControlRadius = "md" | "sm";
type ControlBorder = "strong" | "subtle";
type BadgeTone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "gold"
  | "coral";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  block = false,
  shape: ButtonShape = "pill",
  elevation: ButtonElevation = "raised",
  className?: string,
) {
  return cx(
    "ui-button",
    `ui-button--${variant}`,
    size === "sm" && "ui-button--sm",
    size === "lg" && "ui-button--lg",
    block && "ui-button--block",
    shape === "rounded" && "ui-button--rounded",
    elevation === "flat" && "ui-button--flat",
    className,
  );
}

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  shape?: ButtonShape;
  elevation?: ButtonElevation;
};

export function Button({
  variant,
  size,
  block,
  shape,
  elevation,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName(
        variant,
        size,
        block,
        shape,
        elevation,
        className,
      )}
      {...props}
    />
  );
}

export type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  shape?: ButtonShape;
  elevation?: ButtonElevation;
};

export function ButtonLink({
  variant,
  size,
  block,
  shape,
  elevation,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName(
        variant,
        size,
        block,
        shape,
        elevation,
        className,
      )}
      {...props}
    />
  );
}

type CardElement = "article" | "section" | "div";

export type CardProps = ComponentPropsWithoutRef<"section"> & {
  as?: CardElement;
  padding?: CardPadding;
  layout?: CardLayout;
  elevation?: CardElevation;
};

export function Card({
  as: Component = "section",
  padding = "md",
  layout = "stack",
  elevation = "sm",
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cx(
        "ui-card",
        padding === "md" && "ui-card--padded",
        padding === "compact" && "ui-card--compact",
        padding === "flush" && "ui-card--flush",
        padding === "spacious" && "ui-card--spacious",
        layout === "plain" && "ui-card--plain",
        elevation === "md" && "ui-card--elevated",
        className,
      )}
      {...props}
    />
  );
}

export type CardHeaderProps = ComponentPropsWithoutRef<"div">;

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return <div className={cx("ui-card-header", className)} {...props} />;
}

export type CardTitleProps = ComponentPropsWithoutRef<"h2"> & {
  as?: "h2" | "h3";
};

export function CardTitle({
  as: Component = "h2",
  className,
  ...props
}: CardTitleProps) {
  return <Component className={cx("ui-card-title", className)} {...props} />;
}

export type CardDescriptionProps = ComponentPropsWithoutRef<"p">;

export function CardDescription({
  className,
  ...props
}: CardDescriptionProps) {
  return <p className={cx("ui-card-description", className)} {...props} />;
}

export type FieldProps = ComponentPropsWithoutRef<"label"> & {
  label?: ReactNode;
  hint?: ReactNode;
};

export function Field({ label, hint, children, className, ...props }: FieldProps) {
  return (
    <label className={cx("ui-field", className)} {...props}>
      {label ? <span className="ui-field-label">{label}</span> : null}
      {children}
      {hint ? <p className="ui-field-hint">{hint}</p> : null}
    </label>
  );
}

export type InputProps = ComponentPropsWithoutRef<"input"> & {
  controlSize?: ControlSize;
  radius?: ControlRadius;
  border?: ControlBorder;
};

function controlClassName(
  baseClassName: string,
  controlSize: ControlSize = "md",
  radius: ControlRadius = "md",
  border: ControlBorder = "strong",
  className?: string,
) {
  return cx(
    baseClassName,
    controlSize === "lg" && "ui-control--lg",
    radius === "sm" && "ui-control--radius-sm",
    border === "subtle" && "ui-control--border-subtle",
    className,
  );
}

export function Input({
  controlSize,
  radius,
  border,
  className,
  ...props
}: InputProps) {
  return (
    <input
      className={controlClassName(
        "ui-input",
        controlSize,
        radius,
        border,
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps = ComponentPropsWithoutRef<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cx("ui-textarea", className)} {...props} />;
}

export type SelectProps = ComponentPropsWithoutRef<"select">;

export function Select({ className, ...props }: SelectProps) {
  return <select className={cx("ui-select", className)} {...props} />;
}

export type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`, className)} {...props} />;
}

export type FormMessageProps = ComponentPropsWithoutRef<"p"> & {
  tone?: "error" | "success";
};

export function FormMessage({
  tone = "error",
  className,
  ...props
}: FormMessageProps) {
  return (
    <p
      className={cx("ui-form-message", `ui-form-message--${tone}`, className)}
      {...props}
    />
  );
}

type Gap = CSSProperties["gap"];

export type StackProps = ComponentPropsWithoutRef<"div"> & {
  gap?: Gap;
};

export function Stack({ gap, className, style, ...props }: StackProps) {
  return (
    <div
      className={cx("ui-stack", className)}
      style={{ "--stack-gap": gap, ...style } as CSSProperties}
      {...props}
    />
  );
}

export type InlineProps = ComponentPropsWithoutRef<"div"> & {
  gap?: Gap;
};

export function Inline({ gap, className, style, ...props }: InlineProps) {
  return (
    <div
      className={cx("ui-inline", className)}
      style={{ "--inline-gap": gap, ...style } as CSSProperties}
      {...props}
    />
  );
}

export type SegmentedControlProps = ComponentPropsWithoutRef<"div">;

export function SegmentedControl({
  className,
  ...props
}: SegmentedControlProps) {
  return <div className={cx("ui-segmented", className)} {...props} />;
}

export type SegmentedControlItemProps = ComponentPropsWithoutRef<"button"> & {
  active?: boolean;
};

export function SegmentedControlItem({
  active,
  className,
  ...props
}: SegmentedControlItemProps) {
  return (
    <button
      aria-pressed={active}
      className={cx("ui-segmented-item", className)}
      type="button"
      {...props}
    />
  );
}

export type PolymorphicInlineProps = ComponentPropsWithoutRef<"span"> & {
  as?: ElementType;
};
