import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { REFERRAL_CHANNELS } from '@lilink/shared';

const REFERRAL_CODE_MAX_INPUT_LENGTH = 16;

export class CreateReferralEventDto {
  @IsIn([...REFERRAL_CHANNELS])
  channel!: string;
}

export class CreateReferralClickDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REFERRAL_CODE_MAX_INPUT_LENGTH)
  code!: string;

  @IsOptional()
  @IsIn([...REFERRAL_CHANNELS])
  channel?: string;
}
