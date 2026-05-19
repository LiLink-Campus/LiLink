import Link from "next/link";
import type { ReactNode } from "react";
import { TeaTimeIllustration } from "./illustrations";

export type MatchStateAction = {
  label: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
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
  const className =
    variant === "primary" ? "button-primary" : "button-secondary";
  const label = action.loading ? <>{action.label}…</> : action.label;

  if (action.href && !action.disabled) {
    return (
      <Link className={className} href={action.href} key={`${index}`} style={action.style}>
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
      style={action.style}
    >
      {label}
    </button>
  );
}

/**
 * The match page's primary card. Six visual templates dispatched from this
 * single component so the page logic stays declarative and the cards stay
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
          <header className="v2-focus-card-head" style={{ marginBottom: '1rem' }}>
            <span className="v2-focus-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: '#eaf4ee', color: '#4a825e', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.8rem', fontWeight: 500 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', background: '#5a9972', color: 'white', borderRadius: '50%', fontSize: '0.6rem' }}>✓</span> 本轮匹配成功
            </span>
          </header>
          <div className="v2-match-hero-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {avatarInitial ? (
                <span className="v2-match-hero-avatar" aria-hidden="true" style={{ width: '4rem', height: '4rem', borderRadius: '50%', background: '#fdf1f4', color: '#883b4c', display: 'grid', placeItems: 'center', fontSize: '1.75rem', fontWeight: 'bold', border: '1px solid #f8e1e7' }}>
                  {avatarInitial}
                </span>
              ) : null}
              <div className="v2-match-hero-identity" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <h2 className="v2-focus-title" style={{ fontSize: '1.25rem', margin: 0 }}>{title}</h2>
                {subtitle ? <p className="v2-match-hero-sub" style={{ margin: 0, color: 'var(--fg-secondary)', fontSize: '0.8rem' }}>{subtitle}</p> : null}
              </div>
            </div>
            {typeof score === "number" ? (
              <div className="v2-match-hero-score" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#f9fcf9', border: '1px solid #eef5ef', borderRadius: '0.5rem', padding: '0.25rem 0.75rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--fg-secondary)' }}>匹配度</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.1rem' }}>
                  <strong style={{ fontSize: '1.25rem', color: '#3a7d65', fontWeight: 600 }}>{Math.round(score)}</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--fg-secondary)' }}>/ 100</span>
                </div>
              </div>
            ) : null}
          </div>
          
          {contactLine ? <div className="v2-match-hero-contact" style={{ padding: '0.75rem', background: 'var(--bg-soft)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{contactLine}</div> : null}
          {body ? <p className="v2-focus-body" style={{ fontSize: '0.9rem', color: 'var(--fg-secondary)', marginBottom: '1rem' }}>{body}</p> : null}
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
          {subtitle ? <p className="v2-match-hero-sub" style={{ margin: 0, color: 'var(--fg-secondary)', fontSize: '0.9rem' }}>{subtitle}</p> : null}
          
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
        {subtitle ? <p className="v2-match-hero-sub" style={{ margin: 0, color: 'var(--fg-secondary)', fontSize: '0.9rem' }}>{subtitle}</p> : null}
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
