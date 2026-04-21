type ClientIpRequest = {
  headers?: Record<string, unknown>;
  ip?: string;
  ips?: readonly string[];
};

const CF_CONNECTING_IP_HEADER = 'cf-connecting-ip';

/**
 * Resolve the real client IP for rate-limit accounting.
 *
 * Cloudflare sits in front of the production API and rewrites the source
 * IP to one of its edge addresses, so falling back to req.ip would bucket
 * unrelated users together (and let attackers spread across edges to dodge
 * per-IP throttles). When the request was forwarded by Cloudflare, the
 * real client IP is exposed via the `CF-Connecting-IP` header.
 *
 * SECURITY NOTE: Trusting `CF-Connecting-IP` blindly assumes every request
 * reached the API through Cloudflare. If the VPS public IP is reachable
 * directly (i.e. Cloudflare is not enforced at the firewall/Caddy layer),
 * an attacker can spoof this header and bypass per-IP throttles. The
 * proper deployment-side fix is to allow-list Cloudflare's IP ranges at
 * Caddy or the host firewall. Tracked as a follow-up; see runbook.
 */
export function getRealClientIp(request: ClientIpRequest): string {
  const headerValue = request.headers?.[CF_CONNECTING_IP_HEADER];
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }

  if (Array.isArray(request.ips) && request.ips.length > 0) {
    return request.ips[0];
  }

  return request.ip ?? 'unknown';
}
