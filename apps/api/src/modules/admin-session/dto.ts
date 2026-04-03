import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const ADMIN_PASSWORD_MAX_LENGTH = 128;

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(ADMIN_PASSWORD_MAX_LENGTH)
  password!: string;
}
