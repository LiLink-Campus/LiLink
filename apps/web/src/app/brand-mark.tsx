import Link from "next/link";
import styles from "./brand-mark.module.css";
import { shellAssets } from "../lib/shell-assets.generated";

type BrandMarkProps = {
  href?: string;
  variant?: "default" | "compact" | "stacked";
  showTagline?: boolean;
};

export function BrandIcon() {
  return (
    // Fixed SVG artwork needs no client image optimizer or loader.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={shellAssets["icons/icon.svg"]} alt="" width={52} height={52} loading="lazy" decoding="async" className={styles.art} />
  );
}

/** Shared vector dove mark for public pages and application shells. */
export function BrandMark({ href = "/", variant = "default", showTagline = true }: BrandMarkProps) {
  const className =
    variant === "compact"
      ? "brand-mark app-header-brand"
      : variant === "stacked"
        ? `${styles.brandMark} ${styles.stacked} brand-mark brand-mark-stacked`
        : `${styles.brandMark} brand-mark`;

  return (
    <Link prefetch={false}
      href={href}
      className={`${className} ${showTagline ? styles.withTagline : ""}`}
      aria-label="LiLink 首页"
    >
      <span className={`${styles.glyph} brand-glyph`} aria-hidden="true">
        <BrandIcon />
      </span>
      <span className={`${styles.text} brand-text`}>
        <strong>LiLink</strong>
        {showTagline ? <small>校园里的，认真相遇</small> : null}
      </span>
    </Link>
  );
}
