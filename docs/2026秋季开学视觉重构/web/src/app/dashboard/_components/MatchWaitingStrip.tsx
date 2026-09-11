import Link from "next/link";
import { RevealCountdown } from "./RevealCountdown";
import styles from "./MatchWaitingStrip.module.css";

export type MatchWaitingAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

/** Letter-style card for match states without a counterpart. */
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
  return (
    <section className={styles.strip} data-state={variant} aria-label={title}>
      <div className={styles.content}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.sub}>{subtitle}</p>
        {revealAt || revealLabel ? (
          <div className={styles.revealRow}>
            {revealAt ? (
              <>
                <span className={styles.countdownLabel}>距离结果公布</span>
                <RevealCountdown
                  targetIso={revealAt}
                  prefix="距"
                  expiredLabel="即将揭晓"
                  includeSeconds
                  className={styles.revealCountdown}
                />
              </>
            ) : null}
            {revealLabel ? <p className={styles.revealWhen}>{revealLabel} · 北京时间</p> : null}
          </div>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action, index) => (
            <Link
              key={`${action.label}-${index}`}
              href={action.href}
              className={action.variant === "primary" ? styles.primary : styles.secondary}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
