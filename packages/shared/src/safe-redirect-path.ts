const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Returns a same-origin path + query + hash suitable for client-side navigation,
 * or null if the candidate must not be used (cross-origin, scheme-relative path,
 * unsafe characters, etc.).
 */
export function sanitizeSameOriginRelativePath(
  candidate: string | null | undefined,
  baseOrigin: string,
): string | null {
  if (candidate == null || candidate === "") {
    return null;
  }
  if (CONTROL_CHARS.test(candidate)) {
    return null;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseOrigin);
  } catch {
    return null;
  }

  if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") {
    return null;
  }

  let resolved: URL;
  try {
    resolved = new URL(candidate, baseUrl);
  } catch {
    return null;
  }

  if (resolved.origin !== baseUrl.origin) {
    return null;
  }

  if (resolved.protocol !== baseUrl.protocol) {
    return null;
  }

  const { pathname } = resolved;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return null;
  }

  return `${pathname}${resolved.search}${resolved.hash}`;
}
