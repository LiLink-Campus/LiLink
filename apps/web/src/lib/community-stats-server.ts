import "server-only";
import { getCachedPublicData } from "./public-data-cache";
import type { CommunityStatsPayload } from "./community-stats";

export function getCommunityStats() {
  return getCachedPublicData<CommunityStatsPayload>("/public/community");
}
