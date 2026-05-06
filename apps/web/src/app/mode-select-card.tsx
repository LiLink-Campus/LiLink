import Link from "next/link";
import type { ReactNode } from "react";

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
    ? "mode-card-status is-upcoming"
    : "mode-card-status";

  return (
    <article
      className={
        status?.tone === "upcoming" ? "mode-card is-upcoming" : "mode-card"
      }
    >
      <div className="mode-card-illustration" aria-hidden="true">
        {illustration}
      </div>
      <div className="mode-card-body">
        <div className="mode-card-head">
          <h3 className="mode-card-title">{title}</h3>
          {status ? (
            <span className={toneClass}>{status.label}</span>
          ) : null}
        </div>
        <p className="mode-card-tagline">{tagline}</p>
        {footerLine ? (
          <p className="mode-card-footer">{footerLine}</p>
        ) : null}
        {cta ? (
          <Link className="mode-card-cta" href={cta.href}>
            {cta.label}
          </Link>
        ) : disabledCtaLabel ? (
          <span className="mode-card-cta is-disabled" aria-disabled="true">
            {disabledCtaLabel}
          </span>
        ) : null}
      </div>
    </article>
  );
}
