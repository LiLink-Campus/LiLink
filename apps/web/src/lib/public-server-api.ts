import "server-only";

import { getServerApiBaseUrl } from "./api-base-url";
import { getCachedPublicData } from "./public-data-cache";
import type { LandingPayload } from "./landing-payload";

export async function resolveApiOriginForPreconnect(): Promise<string | null> {
  try {
    return new URL(await getServerApiBaseUrl()).origin;
  } catch {
    return null;
  }
}

export function getLandingPayload() {
  return getCachedPublicData<LandingPayload>("/public/landing");
}
