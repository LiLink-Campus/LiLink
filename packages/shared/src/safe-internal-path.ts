/**
 * Validates a root-relative in-app navigation target from untrusted query input.
 * Blocks protocol-relative URLs (e.g. //evil.test), backslashes, and control chars.
 */
export function parseSafeInternalPath(next: string | null): string | null {
  if (next == null || next === "") {
    return null;
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    return null;
  }

  if (next.includes("\\") || /[\0\r\n\t]/.test(next)) {
    return null;
  }

  return next;
}

/**
 * Same as {@link parseSafeInternalPath}, but restricts targets to the admin area.
 */
export function parseSafeAdminPostLoginPath(next: string | null): string | null {
  const safe = parseSafeInternalPath(next);
  if (!safe) {
    return null;
  }

  if (safe === "/admin" || safe.startsWith("/admin/")) {
    return safe;
  }

  return null;
}
