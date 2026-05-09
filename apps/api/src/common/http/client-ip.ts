type ClientIpRequest = {
  headers?: Record<string, unknown>;
  ip?: string;
  ips?: readonly string[];
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
};

const CF_CONNECTING_IP_HEADER = 'cf-connecting-ip';
const IPV6_MAPPED_IPV4_PREFIX = '::ffff:';
// RFC 1918 + loopback. Anything else (i.e. arriving from a real public IP)
// is treated as untrusted, regardless of which header it brings along.
const PRIVATE_IPV4_PREFIXES = ['127.', '10.', '192.168.'];
const PRIVATE_IPV4_172_REGEX = /^172\.(1[6-9]|2\d|3[01])\./;

function normalizeSocketIp(rawIp: string): string {
  return rawIp.startsWith(IPV6_MAPPED_IPV4_PREFIX)
    ? rawIp.slice(IPV6_MAPPED_IPV4_PREFIX.length)
    : rawIp;
}

function isTrustedProxySource(rawIp: string | undefined): boolean {
  if (!rawIp) {
    return false;
  }

  if (rawIp === '::1') {
    return true;
  }

  const normalized = normalizeSocketIp(rawIp);
  if (PRIVATE_IPV4_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  return PRIVATE_IPV4_172_REGEX.test(normalized);
}

/**
 * Resolve the real client IP for rate-limit accounting.
 *
 * Cloudflare sits in front of the production API and rewrites the source
 * IP to one of its edge addresses, so falling back to req.ip would bucket
 * unrelated users together (and let attackers spread across edges to dodge
 * per-IP throttles). When the request was forwarded by Cloudflare, the
 * real client IP is exposed via the `CF-Connecting-IP` header.
 *
 * Defence in depth: only honour the header when the immediate TCP peer is
 * a trusted reverse proxy (loopback or RFC 1918). This is enough because:
 *   - Caddy listens on 80/443 and is the only path to reach the API;
 *   - the API itself binds to 127.0.0.1:4000, unreachable from the public
 *     internet directly;
 *   - inside the docker bridge network, Caddy connects from the bridge
 *     gateway (e.g. 172.19.0.1), which is private.
 *
 * If a future deployment exposes the API directly to the internet, this
 * predicate will refuse to trust spoofed CF-Connecting-IP, X-Forwarded-For,
 * and Express-derived `req.ip` values and will fall back to the TCP peer
 * address instead.
 *
 * Edge-layer firewall complements this: only Cloudflare IPs may reach
 * Caddy at all (see ops/firewall scripts).
 */
export function getRealClientIp(request: ClientIpRequest): string {
  const socketIp =
    request.socket?.remoteAddress ?? request.connection?.remoteAddress;
  const headerValue = request.headers?.[CF_CONNECTING_IP_HEADER];
  const peerTrusted = isTrustedProxySource(socketIp);

  if (
    peerTrusted &&
    typeof headerValue === 'string' &&
    headerValue.length > 0
  ) {
    return headerValue;
  }

  // With `trust proxy` enabled, Express derives `req.ip` / `req.ips` from
  // X-Forwarded-For. Only consume those when the TCP peer is a trusted
  // reverse proxy; otherwise a client that hits the API directly can spoof
  // arbitrary addresses and bypass per-IP throttles.
  if (peerTrusted) {
    const forwardedIps = request.ips;
    if (forwardedIps && forwardedIps.length > 0) {
      const firstForwardedIp = forwardedIps[0];
      if (typeof firstForwardedIp === 'string' && firstForwardedIp.length > 0) {
        return firstForwardedIp;
      }
    }

    if (request.ip) {
      return request.ip;
    }
  }

  if (socketIp) {
    return normalizeSocketIp(socketIp);
  }

  return 'unknown';
}
