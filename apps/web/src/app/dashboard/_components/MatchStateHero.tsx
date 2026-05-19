import Link from "next/link";
import type { ReactNode } from "react";

export type MatchStateAction = {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  className?: string;
  disabled?: boolean;
  loading?: boolean;
};

export type MatchStateHeroProps = {
  /** Visual layout variant. */
  variant: "matched" | "empty" | "limited" | "waiting";
  /** Optional initial letter to render as avatar (only for matched variant). */
  avatarInitial?: string;
  /** Primary heading shown right next to avatar / centered. */
  title: string;
  /** Optional secondary line below title. */
  subtitle?: string;
  /** Optional match score shown as the right chip. */
  score?: number | null;
  /** Body copy below the row. */
  body?: ReactNode;
  /** Highlighted contact line (e.g. introduced email/wechat). */
  contactLine?: ReactNode;
  /** Optional row of action buttons. */
  actions?: MatchStateAction[];
  /** Extra inline content (chips, intro, etc.) shown below body. */
  children?: ReactNode;
};

function renderAction(action: MatchStateAction, index: number) {
  const variant = action.variant ?? "primary";
  const baseClassName =
    variant === "primary" ? "button-primary" : "button-secondary";
  const className = action.className
    ? `${baseClassName} ${action.className}`
    : baseClassName;
  const label = action.loading ? <>{action.label}…</> : action.label;

  if (action.href && !action.disabled) {
    return (
      <Link className={className} href={action.href} key={`${index}`}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      key={`${index}`}
      className={className}
      onClick={action.onClick}
      disabled={action.disabled || action.loading}
    >
      {label}
    </button>
  );
}

/**
 * The match page's primary card. Visual variants are dispatched from this
 * single component so page logic stays declarative and the cards stay
 * visually consistent.
 */
export function MatchStateHero({
  variant,
  avatarInitial,
  title,
  subtitle,
  score,
  body,
  contactLine,
  actions,
  children,
}: MatchStateHeroProps) {
  if (variant === "matched") {
    return (
      <section className="v2-focus-card tone-celebrate" aria-label={title}>
        <div className="v2-focus-card-content">
          <header className="v2-focus-card-head v2-match-hero-status-head">
            <span className="v2-focus-eyebrow v2-match-hero-status-pill">
              <span className="v2-match-hero-status-icon">✓</span> 本轮匹配成功
            </span>
          </header>
          <div className="v2-match-hero-row v2-match-hero-main-row">
            <div className="v2-match-hero-profile">
              {avatarInitial ? (
                <span className="v2-match-hero-avatar" aria-hidden="true">
                  {avatarInitial}
                </span>
              ) : null}
              <div className="v2-match-hero-identity">
                <h2 className="v2-focus-title v2-match-hero-title">{title}</h2>
                {subtitle ? <p className="v2-match-hero-sub">{subtitle}</p> : null}
              </div>
            </div>
            {typeof score === "number" ? (
              <div className="v2-match-hero-score">
                <span>匹配度</span>
                <div className="v2-match-hero-score-value">
                  <strong>{Math.round(score)}</strong>
                  <span>/ 100</span>
                </div>
              </div>
            ) : null}
          </div>

          {contactLine ? <div className="v2-match-hero-contact is-neutral">{contactLine}</div> : null}
          {body ? <p className="v2-focus-body v2-match-hero-body-compact">{body}</p> : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className="v2-focus-actions">
            {actions.map((action, index) => renderAction(action, index))}
          </div>
        ) : null}
      </section>
    );
  }

  if (variant === "limited") {
    return (
      <section className="v2-focus-card tone-waiting" aria-label={title}>
        <div className="v2-focus-card-content">
          <header className="v2-focus-card-head">
            <span className="v2-focus-eyebrow">匹配受限</span>
          </header>
          <h2 className="v2-focus-title">{title}</h2>
          {subtitle ? <p className="v2-match-hero-sub">{subtitle}</p> : null}

          {typeof score === "number" ? (
            <div className="v2-focus-meta-row">
              <span className="v2-focus-meta-chip">
                匹配度 <strong>{score.toFixed(1)} / 100</strong>
              </span>
            </div>
          ) : null}

          {body ? <p className="v2-focus-body">{body}</p> : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className="v2-focus-actions">
            {actions.map((action, index) => renderAction(action, index))}
          </div>
        ) : null}
      </section>
    );
  }

  // empty / waiting: centered illustration variant
  return (
    <section className={`v2-focus-card ${variant === 'waiting' ? 'tone-waiting' : 'tone-default'}`} aria-label={title}>
      <div className="v2-focus-card-content">
        <header className="v2-focus-card-head">
          <span className="v2-focus-eyebrow">{variant === 'waiting' ? '等待中' : '暂无匹配'}</span>
        </header>
        <h2 className="v2-focus-title">{title}</h2>
        {subtitle ? <p className="v2-match-hero-sub">{subtitle}</p> : null}
        {body ? <p className="v2-focus-body">{body}</p> : null}
        {children}
      </div>
      {actions && actions.length > 0 ? (
        <div className="v2-focus-actions">
          {actions.map((action, index) => renderAction(action, index))}
        </div>
      ) : null}
    </section>
  );
}
