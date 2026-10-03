import type { CSSProperties, ImgHTMLAttributes } from "react";
import { staticImageManifest, type StaticImageSource } from "@/lib/static-image-manifest";

type ImageSelection = {
  src: StaticImageSource;
  width?: number;
  sizes?: string;
};

export type StaticImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes"> & ImageSelection & {
  alt: string;
  fill?: boolean;
  priority?: boolean;
};

/** The resource hint and rendered image must use the same responsive selection. */
export function getStaticImageProps({ src, width, sizes }: ImageSelection) {
  const asset = staticImageManifest[src];
  const variants = asset.variants;
  return {
    src: variants[variants.length - 1].src,
    srcSet: variants.map(variant => `${variant.src} ${variant.width}w`).join(", "),
    sizes: sizes ?? `${width ?? asset.width}px`,
  };
}

/** Fixed images are resized at build time and served from Vercel's static files. */
export function StaticImage({
  src, alt, width, height, sizes, fill = false, priority = false,
  loading, fetchPriority, style, ...props
}: StaticImageProps) {
  const image = getStaticImageProps({ src, width: typeof width === "number" ? width : undefined, sizes });
  const fillStyle: CSSProperties | undefined = fill ? {
    position: "absolute", width: "100%", height: "100%",
    left: 0, top: 0, right: 0, bottom: 0,
  } : undefined;
  // React emits responsive preloads for eager images; avoid a duplicate link.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      {...image}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : loading ?? "lazy"}
      fetchPriority={fetchPriority ?? (priority ? "high" : undefined)}
      decoding="async"
      style={{ ...fillStyle, ...style }}
    />
  );
}
