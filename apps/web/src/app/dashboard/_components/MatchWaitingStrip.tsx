import Link from "next/link";

export type MatchWaitingAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

/**
 * Compact replacement for the old oversized empty/waiting MatchStateHero cards.
 * A slim strip: status dot + title + subtitle, an optional reveal-time chip,
 * and inline link actions — no large empty box.
 */
export function MatchWaitingStrip({
  title,
  subtitle,
  revealLabel,
  actions,
}: {
  title: string;
  subtitle: string;
  revealLabel?: string | null;
  actions: MatchWaitingAction[];
}) {
  return (
    <section className="v2-match-strip" aria-label={title}>
      <div className="v2-match-strip-head">
        <span className="v2-match-strip-dot" aria-hidden="true" />
        <div className="v2-match-strip-main">
          <p className="v2-match-strip-title">{title}</p>
          <p className="v2-match-strip-sub">{subtitle}</p>
        </div>
        {revealLabel ? (
          <span className="v2-match-strip-chip">{revealLabel} 揭晓</span>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="v2-match-strip-actions">
          {actions.map((action, index) => (
            <Link
              key={`${action.label}-${index}`}
              href={action.href}
              className={
                action.variant === "primary"
                  ? "ui-button ui-button--primary"
                  : "ui-button ui-button--secondary"
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
