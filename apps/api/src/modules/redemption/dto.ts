import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { REDEEM_CODE_MAX_LENGTH } from '../../common/validation/input-limits';

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REDEEM_CODE_MAX_LENGTH)
  code!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  totp!: string;
}
