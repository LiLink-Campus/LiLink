// Enabled only by this visual copy's development configuration.
export const VISUAL_PREVIEW = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LILINK_VISUAL_PREVIEW === "1";

export function isVisualPreview() {
  return VISUAL_PREVIEW && (typeof window === "undefined" || ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));
}
