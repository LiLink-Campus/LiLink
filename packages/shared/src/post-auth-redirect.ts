/**
 * Resolves the `next` query value after login to a same-origin path.
 * Rejects protocol-relative URLs, absolute off-origin URLs, and other
 * values that would bypass a naive `startsWith("/")` check.
 */
export function resolveSafePostAuthRedirect(
  nextParam: string | null | undefined,
  pageOrigin: string,
  defaultPath: string,
): string {
  if (nextParam == null) {
    return defaultPath;
  }
  const trimmed = nextParam.trim();
  if (trimmed.length === 0) {
    return defaultPath;
  }
  if (trimmed.includes("\\")) {
    return defaultPath;
  }

  let base: URL;
  try {
    base = new URL(pageOrigin);
  } catch {
    return defaultPath;
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    return defaultPath;
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    return defaultPath;
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return defaultPath;
  }
  if (resolved.origin !== base.origin) {
    return defaultPath;
  }

  const pathQueryHash = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  if (!pathQueryHash.startsWith("/")) {
    return defaultPath;
  }
  return pathQueryHash;
}
