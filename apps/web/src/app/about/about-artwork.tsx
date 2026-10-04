import styles from "./about.module.css";
import previewStyles from "./about-preview.generated.module.css";

const artwork = "/images/about/watercolor-atlas.618382ffbabd.webp";

export function AboutArtwork({ className, priority = false }: {
  className: string;
  priority?: boolean;
}) {
  return <div className={`${className} ${previewStyles.preview}`} data-about-preview aria-hidden="true">
    {/* All crops share the eager atlas; lazy copies can refetch a WebKit preload. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img
      className={styles.atlas}
      src={artwork}
      alt=""
      width={2172}
      height={724}
      loading="eager"
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      data-page-image={priority ? true : undefined}
    />
  </div>;
}
