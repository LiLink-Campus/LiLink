import { getRealClientIp } from './client-ip';

const trustedSocket = { remoteAddress: '172.19.0.1' };
const loopbackSocket = { remoteAddress: '127.0.0.1' };
const ipv6LoopbackSocket = { remoteAddress: '::1' };
const ipv6MappedSocket = { remoteAddress: '::ffff:10.0.0.1' };
const publicSocket = { remoteAddress: '198.51.100.5' };

describe('getRealClientIp', () => {
  describe('with a trusted (private/loopback) socket peer', () => {
    it('prefers CF-Connecting-IP when present', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          ip: '198.51.100.1',
          ips: ['198.51.100.1'],
          socket: trustedSocket,
        }),
      ).toBe('203.0.113.7');
    });

    it('treats IPv6 loopback as trusted', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          socket: ipv6LoopbackSocket,
        }),
      ).toBe('203.0.113.7');
    });

    it('treats IPv6-mapped IPv4 private addresses as trusted', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          socket: ipv6MappedSocket,
        }),
      ).toBe('203.0.113.7');
    });

    it('falls back to req.ips[0] when the CF header is missing', () => {
      expect(
        getRealClientIp({
          headers: {},
          ip: '198.51.100.1',
          ips: ['203.0.113.10', '198.51.100.1'],
          socket: loopbackSocket,
        }),
      ).toBe('203.0.113.10');
    });

    it('ignores empty CF-Connecting-IP and uses fallback', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '' },
          ip: '198.51.100.1',
          socket: loopbackSocket,
        }),
      ).toBe('198.51.100.1');
    });
  });

  describe('with an untrusted (public) socket peer', () => {
    it('refuses to honour CF-Connecting-IP and uses req.ip instead', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          ip: '198.51.100.5',
          ips: ['198.51.100.5'],
          socket: publicSocket,
        }),
      ).toBe('198.51.100.5');
    });

    it('falls back to socket address when nothing else is available', () => {
      expect(
        getRealClientIp({
          headers: { 'cf-connecting-ip': '203.0.113.7' },
          socket: publicSocket,
        }),
      ).toBe('198.51.100.5');
    });
  });

  it('returns "unknown" when nothing identifies the client', () => {
    expect(getRealClientIp({ headers: {} })).toBe('unknown');
  });
});
