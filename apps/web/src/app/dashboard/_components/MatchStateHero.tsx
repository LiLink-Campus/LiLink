import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./MatchStateHero.module.css";

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function renderAction(action: MatchStateAction, index: number) {
  const variant = action.variant ?? "primary";
  const className =
    variant === "primary" ? "ui-button ui-button--primary" : "ui-button ui-button--secondary";
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
      <section className={cx(styles.card, styles.toneCelebrate)} aria-label={title}>
        <div className={styles.content}>
          <header className={cx(styles.head, styles.matchedHead)}>
            <span className={cx(styles.eyebrow, styles.matchedEyebrow)}>
              <span className={styles.matchedEyebrowIcon}>✓</span> 本轮匹配成功
            </span>
          </header>
          <div className={cx(styles.heroRow, styles.matchedRow)}>
            <div className={styles.matchedIdentityRow}>
              {avatarInitial ? (
                <span
                  className={cx(styles.avatar, styles.matchedAvatar)}
                  aria-hidden="true"
                >
                  {avatarInitial}
                </span>
              ) : null}
              <div className={cx(styles.identity, styles.matchedIdentity)}>
                <h2 className={cx(styles.title, styles.matchedTitle)}>{title}</h2>
                {subtitle ? (
                  <p className={cx(styles.sub, styles.matchedSub)}>{subtitle}</p>
                ) : null}
              </div>
            </div>
            {typeof score === "number" ? (
              <div className={cx(styles.score, styles.matchedScore)}>
                <span className={styles.scoreLabel}>匹配度</span>
                <div className={styles.scoreValue}>
                  <strong className={styles.scoreNumber}>{Math.round(score)}</strong>
                  <span className={styles.scoreLabel}>/ 100</span>
                </div>
              </div>
            ) : null}
          </div>

          {contactLine ? (
            <div className={cx(styles.contact, styles.matchedContact)}>{contactLine}</div>
          ) : null}
          {body ? <p className={cx(styles.body, styles.matchedBody)}>{body}</p> : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className={styles.actions}>
            {actions.map((action, index) => renderAction(action, index))}
          </div>
        ) : null}
      </section>
    );
  }

  if (variant === "limited") {
    return (
      <section className={cx(styles.card, styles.toneWaiting)} aria-label={title}>
        <div className={styles.content}>
          <header className={styles.head}>
            <span className={styles.eyebrow}>匹配受限</span>
          </header>
          <h2 className={styles.title}>{title}</h2>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}

          {typeof score === "number" ? (
            <div className={styles.metaRow}>
              <span className={styles.metaChip}>
                匹配度 <strong>{score.toFixed(1)} / 100</strong>
              </span>
            </div>
          ) : null}

          {body ? <p className={styles.body}>{body}</p> : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <div className={styles.actions}>
            {actions.map((action, index) => renderAction(action, index))}
          </div>
        ) : null}
      </section>
    );
  }

  // empty / waiting: centered illustration variant
  return (
    <section
      className={cx(styles.card, variant === "waiting" && styles.toneWaiting)}
      aria-label={title}
    >
      <div className={styles.content}>
        <header className={styles.head}>
          <span className={styles.eyebrow}>{variant === 'waiting' ? '等待中' : '暂无匹配'}</span>
        </header>
        <h2 className={styles.title}>{title}</h2>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {body ? <p className={styles.body}>{body}</p> : null}
        {children}
      </div>
      {actions && actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action, index) => renderAction(action, index))}
        </div>
      ) : null}
    </section>
  );
}
