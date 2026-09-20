import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { REFERRAL_CHANNELS } from '@lilink/shared';

const REFERRAL_CODE_MAX_INPUT_LENGTH = 16;
const REFERRAL_CAMPAIGN_SLUG_MAX_LENGTH = 64;

export class CreateReferralEventDto {
  @IsIn([...REFERRAL_CHANNELS])
  channel!: string;

  // Accepted for backward compatibility; campaign attribution is no longer used.
  @IsOptional()
  @IsString()
  @MaxLength(REFERRAL_CAMPAIGN_SLUG_MAX_LENGTH)
  campaignSlug?: string;
}

export class CreateReferralClickDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(REFERRAL_CODE_MAX_INPUT_LENGTH)
  code!: string;

  @IsOptional()
  @IsIn([...REFERRAL_CHANNELS])
  channel?: string;

  // Accepted for backward compatibility; campaign attribution is no longer used.
  @IsOptional()
  @IsString()
  @MaxLength(REFERRAL_CAMPAIGN_SLUG_MAX_LENGTH)
  campaignSlug?: string;
}
