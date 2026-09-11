import Link from "next/link";
import Image from "next/image";
import styles from "./brand-mark.module.css";

type BrandMarkProps = {
  href?: string;
  variant?: "default" | "compact" | "stacked";
  showTagline?: boolean;
};

export function BrandIcon() {
  return (
    <Image src="/icons/icon.svg" alt="" width={52} height={52} unoptimized className={styles.art} />
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
    <Link
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
