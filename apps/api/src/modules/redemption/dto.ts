import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REDEEM_CODE_MAX_LENGTH,
  REDEEM_ORDER_AMOUNT_MAX,
} from '../../common/validation/input-limits';

// Step 1: verify the scanned short code + the holder's rotating TOTP token.
// `code` is the public short code; `totp` is the 6-digit rotating token.
export class PrepareRedeemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REDEEM_CODE_MAX_LENGTH)
  code!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  totp!: string;
}

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REDEEM_CODE_MAX_LENGTH)
  code!: string;

  // §B: consumption amount in cents. Required by the server only for
  // amount-dependent (tiered) coupons; otherwise ignored. The amount is
  // merchant-entered (not anti-fraud) — it drives tier selection + reconciliation.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(REDEEM_ORDER_AMOUNT_MAX)
  orderAmount?: number;
}
