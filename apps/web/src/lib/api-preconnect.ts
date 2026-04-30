import { apiBaseUrl } from "./api-base-url";

export function resolveApiOriginForPreconnect(): string | null {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return null;
  }
}
