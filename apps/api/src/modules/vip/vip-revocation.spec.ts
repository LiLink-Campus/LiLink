import { planVipRevocation } from './vip-revocation';
import { VIP_DURATION_MS } from './vip.service';

const day = VIP_DURATION_MS / 30;
const date = (days: number) => new Date(Date.UTC(2026, 0, 1) + days * day);
const grants = [
  { id: 'a', expiresAt: date(30) },
  { id: 'b', expiresAt: date(60) },
  { id: 'c', expiresAt: date(90) },
];

describe('VIP revocation periods', () => {
  it('removes only unused time from a partially consumed first card', () => {
    expect(planVipRevocation(grants, new Set(['a']), date(10))).toEqual([
      { id: 'b', expiresAt: date(40) },
      { id: 'c', expiresAt: date(70) },
    ]);
  });

  it('keeps earlier cards unchanged when revoking a queued renewal', () => {
    expect(planVipRevocation(grants, new Set(['b']), date(10))).toEqual([
      { id: 'c', expiresAt: date(60) },
    ]);
  });

  it('does not charge another card for an already consumed card', () => {
    expect(planVipRevocation(grants, new Set(['a']), date(40))).toEqual([]);
    expect(planVipRevocation(grants, new Set(['a']), date(30))).toEqual([]);
  });

  it('removes multiple cards without deducting their cumulative expiry twice', () => {
    expect(planVipRevocation(grants, new Set(['a', 'b']), date(10))).toEqual([
      { id: 'c', expiresAt: date(40) },
    ]);
  });

  it('does not change surviving grants when the target was already revoked', () => {
    expect(planVipRevocation(grants.slice(1), new Set(), date(10))).toEqual([]);
  });
});
