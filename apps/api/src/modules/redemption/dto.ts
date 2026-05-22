import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { REDEEM_CODE_MAX_LENGTH } from '../../common/validation/input-limits';

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REDEEM_CODE_MAX_LENGTH)
  code!: string;

  // ⏸️ §B reserved: orderAmount? (consumption amount) enabled by the
  // redemption-evaluation module; MVP does not accept it.
}
