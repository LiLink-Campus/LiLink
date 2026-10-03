import "server-only";

import { getServerApiBaseUrl } from "./api-base-url";

export async function resolveApiOriginForPreconnect(): Promise<string | null> {
  try {
    return new URL(await getServerApiBaseUrl()).origin;
  } catch {
    return null;
  }
}
