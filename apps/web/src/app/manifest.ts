import type { MetadataRoute } from "next";
import { shellAssets } from "../lib/shell-assets.generated";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LiLink · 校园里的，认真相遇",
    short_name: "LiLink",
    description:
      "LiLink 是面向高校学生的匹配平台。基于深度问卷的匹配算法，每周一次轮次，认真对待每一份期待。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f3",
    theme_color: "#faf9f3",
    lang: "zh-CN",
    dir: "ltr",
    categories: ["social", "lifestyle"],
    icons: [
      { src: shellAssets["icons/icon-192.png"], sizes: "192x192", type: "image/png", purpose: "any" },
      { src: shellAssets["icons/icon-512.png"], sizes: "512x512", type: "image/png", purpose: "any" },
      { src: shellAssets["icons/icon-maskable-512.png"], sizes: "512x512", type: "image/png", purpose: "maskable" },
      {
        src: shellAssets["icons/icon.svg"],
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: shellAssets["icons/icon-maskable.svg"],
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
