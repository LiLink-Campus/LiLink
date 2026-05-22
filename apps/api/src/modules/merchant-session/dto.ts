import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  EMAIL_MAX_LENGTH,
  MERCHANT_USER_PASSWORD_MAX,
} from '../../common/validation/input-limits';

export class MerchantLoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MERCHANT_USER_PASSWORD_MAX)
  password!: string;
}
