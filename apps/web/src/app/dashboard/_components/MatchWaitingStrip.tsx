import Link from "next/link";
import { dcx } from "../_lib/dashboard-class-names";
import { ClockIcon } from "./icons";
import { RevealCountdown } from "./RevealCountdown";
import styles from "./MatchWaitingStrip.module.css";

export type MatchWaitingAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

/**
 * Compact waiting-state strip for the match page with neutral surface styling.
 */
export function MatchWaitingStrip({
  title,
  subtitle,
  revealLabel,
  revealAt,
  eyebrow,
  variant = "waiting",
  actions,
}: {
  title: string;
  subtitle: string;
  revealLabel?: string | null;
  revealAt?: string | null;
  eyebrow?: string;
  variant?: "waiting" | "muted";
  actions: MatchWaitingAction[];
}) {
  const toneClass = variant === "muted" ? styles.muted : styles.waiting;

  return (
    <section
      className={`${styles.strip} ${toneClass}`}
      aria-label={title}
    >
      <div className={styles.topRow}>
        <span className={styles.icon} aria-hidden="true">
          <ClockIcon />
        </span>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      </div>

      <div className={styles.body}>
        <p className={styles.title}>{title}</p>
        <p className={styles.sub}>{subtitle}</p>
      </div>

      {revealLabel ? (
        <p className={styles.revealRow}>
          <span className={styles.revealWhen}>揭晓 · {revealLabel}</span>
          {revealAt ? (
            <span className={styles.revealCountdown}>
              <RevealCountdown targetIso={revealAt} prefix="距揭晓" expiredLabel="即将揭晓" />
            </span>
          ) : null}
        </p>
      ) : null}

      {actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action, index) => (
            <Link
              key={`${action.label}-${index}`}
              href={action.href}
              className={dcx(
                action.variant === "primary"
                  ? "ui-button ui-button--primary"
                  : "ui-button ui-button--secondary",
              )}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
