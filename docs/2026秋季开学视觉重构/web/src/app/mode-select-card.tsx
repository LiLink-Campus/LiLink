import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./mode-select-card.module.css";

type ModeSelectCardProps = {
  /** Title shown on the card. */
  title: string;
  /** Short tagline shown beneath the title. */
  tagline: string;
  /** Footer line — e.g. participant counts or waitlist hint. */
  footerLine?: ReactNode;
  /** Status chip at top-right ("进行中" / "即将开放"). */
  status?: { label: string; tone?: "active" | "upcoming" };
  /** Hand-drawn illustration shown on the left of the card. */
  illustration: ReactNode;
  /** Primary call-to-action: link target + label. Falls back to disabled. */
  cta?: { href: string; label: string };
  /** When set, render a disabled badge button instead of a CTA. */
  disabledCtaLabel?: string;
};

/**
 * Storybook-style mode selection card used on the marketing home and on
 * the dashboard mode picker. Mirrors the "选择一种相遇方式" cards from
 * the LiLink reference design.
 */
export function ModeSelectCard({
  title,
  tagline,
  footerLine,
  status,
  illustration,
  cta,
  disabledCtaLabel,
}: ModeSelectCardProps) {
  const toneClass = status?.tone === "upcoming"
    ? `${styles.status} ${styles.upcoming}`
    : styles.status;

  return (
    <article
      className={
        status?.tone === "upcoming"
          ? `${styles.card} ${styles.upcoming}`
          : styles.card
      }
    >
      <div className={styles.illustration} aria-hidden="true">
        {illustration}
      </div>
      <div className={styles.body}>
        <div className={styles.head}>
          <h3 className={styles.title}>{title}</h3>
          {status ? (
            <span className={toneClass}>{status.label}</span>
          ) : null}
        </div>
        <p className={styles.tagline}>{tagline}</p>
        {footerLine ? (
          <p className={styles.footer}>{footerLine}</p>
        ) : null}
        {cta ? (
          <Link className={styles.cta} href={cta.href}>
            {cta.label}
          </Link>
        ) : disabledCtaLabel ? (
          <span
            className={`${styles.cta} ${styles.disabled}`}
            aria-disabled="true"
          >
            {disabledCtaLabel}
          </span>
        ) : null}
      </div>
    </article>
  );
}
