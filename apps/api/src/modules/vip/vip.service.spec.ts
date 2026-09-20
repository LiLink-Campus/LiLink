import { hashVipCode, VIP_DURATION_MS } from './vip.service';

describe('VIP code normalization', () => {
  it('normalizes pasted separators without changing the secret', () => {
    expect(hashVipCode(' abcd-efgh-ijkl-mnop-qrst-uvwx ')).toBe(
      hashVipCode('ABCDEFGHIJKLMNOPQRSTUVWX'),
    );
    expect(hashVipCode('ABCDEFGHIJKLMNOPQRSTUVWX')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('rejects incomplete and non-ASCII codes', () => {
    expect(() => hashVipCode('short')).toThrow();
    expect(() => hashVipCode('Ａ'.repeat(24))).toThrow();
    expect(VIP_DURATION_MS).toBe(2592000000);
  });
});
