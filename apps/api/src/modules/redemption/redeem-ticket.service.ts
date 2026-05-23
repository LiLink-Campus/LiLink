import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';

export interface RedeemTicketPayload {
  couponId: string;
  merchantId: string;
}

/** Short-lived JWT (3 min) issued to a merchant so they can confirm a coupon redemption. */
@Injectable()
export class RedeemTicketService {
  private readonly secret: string;

  constructor(
    private readonly jwtService: JwtService,
    secret?: string,
  ) {
    this.secret = secret ?? env.REDEEM_TICKET_SECRET;
  }

  /** Sign a redeem ticket payload; expires in 3 minutes. */
  sign(payload: RedeemTicketPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.secret,
      expiresIn: '3m',
    });
  }

  /**
   * Verify signature, expiry, and that the decoded merchantId matches the
   * provided merchantId. Returns the payload on success, null on any failure.
   */
  verify(token: string, merchantId: string): RedeemTicketPayload | null {
    try {
      const decoded = this.jwtService.verify<RedeemTicketPayload>(token, {
        secret: this.secret,
      });
      if (
        typeof decoded.couponId !== 'string' ||
        typeof decoded.merchantId !== 'string'
      ) {
        return null;
      }
      if (decoded.merchantId !== merchantId) {
        return null;
      }
      return { couponId: decoded.couponId, merchantId: decoded.merchantId };
    } catch {
      return null;
    }
  }
}
