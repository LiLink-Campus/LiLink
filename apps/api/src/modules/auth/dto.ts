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
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '../../common/validation/display-name';
import {
  EMAIL_MAX_LENGTH,
  INVITE_CODE_MAX_INPUT_LENGTH,
  PROFILE_FULL_NAME_MAX_LENGTH,
} from '../../common/validation/input-limits';

const PASSWORD_MAX_LENGTH = 128;

export class RequestCodeDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
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
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_FULL_NAME_MAX_LENGTH)
  fullName?: string;

  @IsBoolean()
  @Equals(true, { message: 'Terms must be accepted.' })
  acceptedTerms!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(INVITE_CODE_MAX_INPUT_LENGTH)
  inviteCode?: string;
}

export class LoginDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RequestPasswordResetCodeDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
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
  newPassword!: string;
}
