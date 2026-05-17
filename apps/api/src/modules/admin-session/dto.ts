import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../common/validation/input-limits';

const ADMIN_PASSWORD_MAX_LENGTH = 128;

export class AdminLoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  password!: string;
}
