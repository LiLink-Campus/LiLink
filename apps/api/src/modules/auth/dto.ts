import {
  Equals,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const PASSWORD_MAX_LENGTH = 128;

export class RequestCodeDto {
  @IsEmail()
  email!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must include at least one letter and one number.',
  })
  password!: string;

  @IsString()
  @Length(2, 30)
  displayName!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsBoolean()
  @Equals(true, { message: 'Terms must be accepted.' })
  acceptedTerms!: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
