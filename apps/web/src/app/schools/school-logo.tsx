import manifest from "./school-atlases.generated";
import positions from "./school-atlas-positions.module.css";
import styles from "./school-logo.module.css";

type SchoolLogoProps = { id: string; alt: string; kind: "chinese" | "foreign" };

export function SchoolLogo({ id, alt, kind }: SchoolLogoProps) {
  const logo = manifest.logos[id as keyof typeof manifest.logos];
  if (!logo) throw new Error(`School logo is missing from the static atlas: ${id}`);
  const atlas = manifest.atlases[logo.group as keyof typeof manifest.atlases];

  return (
    <span className={`${styles.logo} ${styles[kind]}`} data-school-logo={kind}>
      <span className={`${styles.crop} ${positions[id]}`}>
        {/* Static DPR variants share a crop atlas and bypass runtime image transformations. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.image}
          src={atlas.variants[0].src}
          srcSet={atlas.variants.map((variant) => `${variant.src} ${variant.dpr}x`).join(", ")}
          width={atlas.width}
          height={atlas.height}
          loading="lazy"
          decoding="async"
          alt={alt}
          data-school-id={id}
        />
      </span>
    </span>
  );
}
