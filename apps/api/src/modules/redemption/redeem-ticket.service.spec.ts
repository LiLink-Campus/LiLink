import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { RedeemTicketService } from './redeem-ticket.service';

function makeService(): RedeemTicketService {
  const jwtService = new JwtService({});
  return new RedeemTicketService(jwtService);
}

describe('RedeemTicketService', () => {
  describe('sign + verify round-trip', () => {
    it('returns the original payload when token is valid and merchantId matches', () => {
      const service = makeService();
      const payload = { couponId: 'c1', merchantId: 'm1' };

      const token = service.sign(payload);
      const result = service.verify(token, 'm1');

      expect(result).not.toBeNull();
      expect(result?.couponId).toBe('c1');
      expect(result?.merchantId).toBe('m1');
    });
  });

  describe('verify with wrong merchantId', () => {
    it('returns null when the decoded merchantId does not match the provided merchantId', () => {
      const service = makeService();
      const token = service.sign({ couponId: 'c1', merchantId: 'm1' });

      const result = service.verify(token, 'm2');

      expect(result).toBeNull();
    });
  });

  describe('verify with tampered/garbage token', () => {
    it('returns null for a tampered token', () => {
      const service = makeService();
      const token = service.sign({ couponId: 'c1', merchantId: 'm1' });
      const tampered = token.slice(0, -5) + 'XXXXX';

      const result = service.verify(tampered, 'm1');

      expect(result).toBeNull();
    });

    it('returns null for a garbage string', () => {
      const service = makeService();

      const result = service.verify('not-a-jwt-at-all', 'm1');

      expect(result).toBeNull();
    });
  });

  describe('verify with expired token', () => {
    it('returns null for an already-expired token (expiresIn 0s)', () => {
      const jwtService = new JwtService({});
      // Sign with -1s expiry so the token is instantly expired
      const token = jwtService.sign(
        { couponId: 'c1', merchantId: 'm1' },
        { secret: env.REDEEM_TICKET_SECRET, expiresIn: -1 },
      );
      const service = makeService();

      const result = service.verify(token, 'm1');

      expect(result).toBeNull();
    });
  });
});
