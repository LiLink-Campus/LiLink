import { normalizePublicHomeSnapshot, type PublicHomeDisplayData } from "@lilink/shared";

export type PublicHomeData = PublicHomeDisplayData;

export type PublicHomeSnapshot = {
  landing: PublicHomeData["landing"] | null;
  community: PublicHomeData["community"] | null;
};

// Cache only fields consumed by the homepage; API metadata stays at its boundary.
export function parsePublicHome(value: unknown): PublicHomeData {
  return normalizePublicHomeSnapshot(value);
}
