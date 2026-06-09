const DEFAULT_API_BASE_URL = "http://localhost:4000/v1";
const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(1, end);
  }

  const colon = host.lastIndexOf(":");
  if (colon === -1) {
    return host;
  }

  if (host.indexOf(":") === colon) {
    return host.slice(0, colon);
  }

  return host;
}

function formatHostForUrl(hostname: string): string {
  // Bracket bare IPv6 literals so the assembled URL stays valid.
  return hostname.includes(":") ? `[${hostname}]` : hostname;
}

function normalizeHostname(host: string | null | undefined): string | null {
  if (!host) {
    return null;
  }

  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }

  return stripPort(trimmed).toLowerCase();
}

function resolveApiBaseUrlForHost(
  host: string | null | undefined,
): string {
  if (process.env.NODE_ENV === "production") {
    const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (!configuredApiBaseUrl) {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL is required in production runtime.",
      );
    }
    return configuredApiBaseUrl;
  }

  const hostname = normalizeHostname(host);
  if (!hostname || LOCAL_DEV_HOSTS.has(hostname)) {
    return DEFAULT_API_BASE_URL;
  }

  return `http://${formatHostForUrl(hostname)}:4000/v1`;
}

export function getClientApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return DEFAULT_API_BASE_URL;
  }

  return resolveApiBaseUrlForHost(window.location.hostname);
}

export async function getServerApiBaseUrl(): Promise<string> {
  const { headers } = await import("next/headers");
  const host = (await headers()).get("host");
  return resolveApiBaseUrlForHost(host);
}

export function resolveConfiguredLanApiHostname(): string | null {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configuredApiBaseUrl) {
    return null;
  }

  try {
    const hostname = new URL(configuredApiBaseUrl).hostname;
    const normalized = normalizeHostname(hostname);
    if (!normalized || LOCAL_DEV_HOSTS.has(normalized)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Web origin for redeem QR URLs. In dev, localhost views use the configured LAN
 * host from setup-dev-mobile so a phone scanning the code can reach the dev PC.
 */
export function getClientWebOrigin(): string {
  if (typeof window === "undefined") {
    return "https://lilink.app";
  }

  if (process.env.NODE_ENV === "production") {
    return window.location.origin;
  }

  const currentHostname = normalizeHostname(window.location.hostname);
  if (currentHostname && !LOCAL_DEV_HOSTS.has(currentHostname)) {
    return window.location.origin;
  }

  const lanHostname = resolveConfiguredLanApiHostname();
  if (lanHostname) {
    const port = window.location.port || "3000";
    return `http://${formatHostForUrl(lanHostname)}:${port}`;
  }

  return window.location.origin;
}
