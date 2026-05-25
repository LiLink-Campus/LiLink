import { cx } from "@/lib/cx";
import Link from "next/link";
import type {
  ComponentPropsWithoutRef,
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
