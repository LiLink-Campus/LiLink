"use client";

import { preload } from "react-dom";

export function HomeArtworkPreload({ src, srcSet, sizes }: {
  src: string;
  srcSet?: string;
  sizes?: string;
}) {
  preload(src, { as: "image", imageSrcSet: srcSet, imageSizes: sizes, fetchPriority: "high" });
  return null;
}
