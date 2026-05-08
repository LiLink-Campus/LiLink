/**
 * Returns true when `path` is safe to assign to `window.location.href` for a
 * same-origin navigation. Rejects scheme-relative URLs (`//evil.com/...`)
 * which begin with "/" but leave the site.
 */
export function isSafeSameOriginRelativePathForBrowserLocation(
  path: string,
): boolean {
  if (!path.startsWith("/")) {
    return false;
  }
  if (path.startsWith("//")) {
    return false;
  }
  if (path.includes("\\")) {
    return false;
  }
  return true;
}
