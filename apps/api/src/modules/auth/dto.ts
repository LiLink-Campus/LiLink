import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
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
  REGISTER_REFERRAL_CODE_MAX_LENGTH,
  PROFILE_FULL_NAME_MAX_LENGTH,
} from '../../common/validation/input-limits';
import { REFERRAL_CHANNELS } from '@lilink/shared';

const REFERRAL_CAMPAIGN_SLUG_MAX_LENGTH = 64;

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

  // Personal referral code (10-char) from the invite link / cookie.
  @IsOptional()
  @IsString()
  @MaxLength(REGISTER_REFERRAL_CODE_MAX_LENGTH)
  referralCode?: string;

  // Channel the user arrived through (?ch=); only known channels are accepted.
  @IsOptional()
  @IsIn([...REFERRAL_CHANNELS])
  channel?: string;

  // Campaign slug from the invite link (?c=); resolved + frozen at registration.
  @IsOptional()
  @IsString()
  @MaxLength(REFERRAL_CAMPAIGN_SLUG_MAX_LENGTH)
  campaignSlug?: string;
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
