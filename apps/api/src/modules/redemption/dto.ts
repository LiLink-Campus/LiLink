import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  REDEEM_CODE_MAX_LENGTH,
  REDEEM_ORDER_AMOUNT_MAX,
} from '../../common/validation/input-limits';

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
