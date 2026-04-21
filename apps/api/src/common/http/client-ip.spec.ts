import { getRealClientIp } from './client-ip';

describe('getRealClientIp', () => {
  it('prefers CF-Connecting-IP when present', () => {
    expect(
      getRealClientIp({
        headers: { 'cf-connecting-ip': '203.0.113.7' },
        ip: '198.51.100.1',
        ips: ['198.51.100.1'],
      }),
    ).toBe('203.0.113.7');
  });

  it('falls back to req.ips[0] when CF header is missing', () => {
    expect(
      getRealClientIp({
        headers: {},
        ip: '198.51.100.1',
        ips: ['203.0.113.10', '198.51.100.1'],
      }),
    ).toBe('203.0.113.10');
  });

  it('falls back to req.ip when neither header nor ips are useful', () => {
    expect(
      getRealClientIp({
        headers: {},
        ip: '198.51.100.1',
      }),
    ).toBe('198.51.100.1');
  });

  it('ignores empty CF-Connecting-IP and uses fallback', () => {
    expect(
      getRealClientIp({
        headers: { 'cf-connecting-ip': '' },
        ip: '198.51.100.1',
      }),
    ).toBe('198.51.100.1');
  });

  it('returns "unknown" when nothing identifies the client', () => {
    expect(getRealClientIp({ headers: {} })).toBe('unknown');
  });
});
