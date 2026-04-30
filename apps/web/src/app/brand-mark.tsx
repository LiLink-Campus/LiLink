import Link from "next/link";
import type { ReactNode } from "react";

type BrandMarkProps = {
  href?: string;
  variant?: "default" | "compact" | "stacked";
  showTagline?: boolean;
  tagline?: ReactNode;
  ariaLabel?: string;
};

/**
 * LiLink brand mark. Wine-red rounded plaque with the "Li" wordmark,
 * matching the marketing poster identity. The compact variant fits the
 * in-app header where vertical space is tight.
 */
export function BrandMark({
  href = "/",
  variant = "default",
  showTagline = true,
  tagline = "校园里的，认真相遇",
  ariaLabel = "LiLink 首页",
}: BrandMarkProps) {
  const className =
    variant === "compact"
      ? "brand-mark app-header-brand"
      : variant === "stacked"
        ? "brand-mark brand-mark-stacked"
        : "brand-mark";

  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      <span className="brand-glyph" aria-hidden="true">
        <span className="brand-glyph-text">Li</span>
        <span className="brand-glyph-sparkle" />
      </span>
      <span className="brand-text">
        <strong>LiLink</strong>
        {showTagline ? <small>{tagline}</small> : null}
      </span>
    </Link>
  );
}
