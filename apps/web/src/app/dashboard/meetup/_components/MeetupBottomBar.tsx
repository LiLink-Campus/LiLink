import Link from "next/link";
import type { ReactNode } from "react";

export type MeetupBottomPrimary = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  tone?: "primary" | "success" | "muted";
};

export type MeetupBottomSecondary = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

/**
 * Sticky bottom action bar used inside the meetup focused mode. Holds at
 * most one primary CTA button + one secondary text-link. On desktop it
 * offsets by the sidebar width so it doesn't overlap navigation.
 *
 * The bar is intentionally render-always (no conditional mount) so that
 * focus / layout stay stable as users move between states; pass an empty
 * `primary` to hide the bar entirely.
 */
export function MeetupBottomBar({
  primary,
  secondary,
  hint,
}: {
  primary: MeetupBottomPrimary | null;
  secondary?: MeetupBottomSecondary | null;
  hint?: ReactNode;
}) {
  if (!primary && !secondary) {
    return null;
  }

  const metaSplit = Boolean(secondary && hint);

  return (
    <div className="v2-meetup-bottom-bar" role="region" aria-label="主操作">
      <div className="v2-meetup-bottom-bar-inner">
        {primary ? renderPrimary(primary) : null}
        {secondary || hint ? (
          <div
            className="v2-meetup-bottom-bar-meta"
            data-meta-layout={metaSplit ? "split" : undefined}
          >
            {secondary ? (
              <button
                type="button"
                className={
                  secondary.tone === "danger"
                    ? "v2-meetup-bottom-secondary tone-danger"
                    : "v2-meetup-bottom-secondary"
                }
                onClick={secondary.onClick}
                disabled={secondary.disabled}
              >
                {secondary.label}
              </button>
            ) : null}
            {hint ? <p className="v2-meetup-bottom-hint">{hint}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function renderPrimary(primary: MeetupBottomPrimary) {
  const tone = primary.tone ?? "primary";
  const className =
    tone === "success"
      ? "v2-meetup-bottom-primary tone-success"
      : tone === "muted"
        ? "v2-meetup-bottom-primary tone-muted"
        : "v2-meetup-bottom-primary";
  const label = primary.loading ? `${primary.label}…` : primary.label;

  if (primary.href && !primary.disabled) {
    return (
      <Link className={className} href={primary.href}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={primary.onClick}
      disabled={primary.disabled || primary.loading}
    >
      {label}
    </button>
  );
}
