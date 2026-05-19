import Link from "next/link";
import type { ReactNode } from "react";

type FocusCardTone = "default" | "attention" | "waiting" | "celebrate";

type FocusCardMetaChip = {
  label: string;
  value: ReactNode;
};

type FocusCardProgress = {
  label: string;
  percent: number;
};

export type FocusCardAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "link";
  disabled?: boolean;
  loading?: boolean;
};

export type FocusCardProps = {
  eyebrow?: string;
  step?: string;
  title: string;
  body?: ReactNode;
  meta?: FocusCardMetaChip[];
  progress?: FocusCardProgress;
  actions?: FocusCardAction[];
  tone?: FocusCardTone;
  icon?: ReactNode;
};

function actionContent(action: FocusCardAction) {
  if (action.loading) {
    return `${action.label}…`;
  }
  return action.label;
}

function renderAction(action: FocusCardAction, index: number) {
  const variant = action.variant ?? "primary";
  const className =
    variant === "link"
      ? "v2-focus-secondary-link"
      : variant === "secondary"
        ? "button-secondary"
        : "button-primary";
  const label = actionContent(action);

  if (action.href && !action.disabled) {
    return (
      <Link
        className={className}
        href={action.href}
        key={`${action.label}-${index}`}
      >
        {label}
        {variant === "link" ? " →" : null}
      </Link>
    );
  }

  return (
    <button
      type="button"
      key={`${action.label}-${index}`}
      className={className}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
    >
      {label}
      {variant === "link" ? " →" : null}
    </button>
  );
}

/**
 * The single most important "thing to do right now" card. One per page
 * (Home / Match), variable content driven by business state. Tone changes
 * the corner glow color but the layout stays consistent.
 */
export function FocusCard({
  eyebrow,
  step,
  title,
  body,
  meta,
  progress,
  actions,
  tone = "default",
  icon,
}: FocusCardProps) {
  return (
    <section
      className={`v2-focus-card tone-${tone}`}
      aria-label={eyebrow ?? title}
    >
      <div className="v2-focus-card-content">
        {eyebrow || step || icon ? (
          <header className="v2-focus-card-head">
            <div className="v2-focus-card-head-left">
              {eyebrow ? <span className="v2-focus-eyebrow">{eyebrow}</span> : null}
              {step ? <span className="v2-focus-step">{step}</span> : null}
            </div>
            {icon ? (
              <div className="v2-focus-card-icon" aria-hidden="true">
                {icon}
              </div>
            ) : null}
          </header>
        ) : null}
        <h2 className="v2-focus-title">{title}</h2>
        {body ? <p className="v2-focus-body">{body}</p> : null}
        {meta && meta.length > 0 ? (
          <div className="v2-focus-meta-row">
            {meta.map((chip, index) => (
              <span className="v2-focus-meta-chip" key={`${chip.label}-${index}`}>
                {chip.label}
                <strong>{chip.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {progress ? (
          <div className="v2-focus-progress">
            <div className="v2-focus-progress-row">
              <span>{progress.label}</span>
              <strong>{progress.percent}%</strong>
            </div>
            <div className="v2-focus-progress-bar">
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, progress.percent))}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
      {actions && actions.length > 0 ? (
        <div className="v2-focus-actions">
          {actions.map((action, index) => renderAction(action, index))}
        </div>
      ) : null}
    </section>
  );
}
