import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTACT_CHANNEL_TYPES,
  EDITABLE_CONTACT_CHANNEL_TYPES,
  HARD_MATCH_GENDERS,
  MATCH_ESTIMATE_BANDS,
  SUPPORTED_LOCALES,
  WEEKLY_INTENTS,
  type MatchEstimateBand,
  type ContactChannelType,
  type ContactMethodPayload,
  type ContactPreferencesPayload,
  type EditableContactChannelType,
  type SupportedLocale,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from '../../common/validation/display-name';
import {
  CONTACT_METHOD_VALUE_MAX_LENGTH,
  PROFILE_ARRAY_ITEM_MAX_LENGTH,
  PROFILE_ARRAY_MAX_ITEMS,
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_HEADLINE_MAX_LENGTH,
  PROFILE_SHORT_TEXT_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH,
  QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS,
  REPORT_DETAILS_MAX_LENGTH,
} from '../../common/validation/input-limits';

export class DeleteAccountDto {
  @IsString()
  @Length(8, 128)
  password!: string;

  @IsIn(['注销账号'])
  confirmation!: string;
}

export class UpdateProfileDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_HEADLINE_MAX_LENGTH)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_BIO_MAX_LENGTH)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  schoolYear?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  programName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  pronouns?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  hometown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(PROFILE_SHORT_TEXT_MAX_LENGTH)
  genderIdentity?: string;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  ageMin?: number;

  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(99)
  ageMax?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROFILE_ARRAY_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(PROFILE_ARRAY_ITEM_MAX_LENGTH, { each: true })
  interestedIn?: string[];
}

export class SaveQuestionnaireDto {
  @IsString()
  @Length(1, 128)
  versionId!: string;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsObject()
  hardMatchForm!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Length(DISPLAY_NAME_MIN_LENGTH, DISPLAY_NAME_MAX_LENGTH)
  displayName?: string;
}

export class AcknowledgeQuestionnaireItemsDto {
  @IsString()
  versionId!: string;

  @IsArray()
  @ArrayMaxSize(QUESTIONNAIRE_ACKNOWLEDGEMENT_KEYS_MAX_ITEMS)
  @IsString({ each: true })
  @MaxLength(QUESTIONNAIRE_ACKNOWLEDGEMENT_KEY_MAX_LENGTH, { each: true })
  keys!: string[];
}

const MATCH_ESTIMATE_MAX_SCHOOLS = 100;
const MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH = 64;

export class MatchEstimateSchoolGenderDto {
  @IsString()
  @MaxLength(MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH)
  schoolId!: string;

  @IsArray()
  @ArrayMaxSize(HARD_MATCH_GENDERS.length)
  @ArrayUnique()
  @IsIn(HARD_MATCH_GENDERS, { each: true })
  genders!: string[];
}

export class MatchEstimateRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_ESTIMATE_MAX_SCHOOLS)
  @IsString({ each: true })
  @MaxLength(MATCH_ESTIMATE_SCHOOL_ID_MAX_LENGTH, { each: true })
  excludedPartnerSchools?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MATCH_ESTIMATE_MAX_SCHOOLS)
  @ValidateNested({ each: true })
  @Type(() => MatchEstimateSchoolGenderDto)
  excludedPartnerSchoolGenders?: MatchEstimateSchoolGenderDto[];
}

export class MatchEstimateResponseDto {
  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional({ enum: MATCH_ESTIMATE_BANDS as unknown as string[] })
  band?: MatchEstimateBand;

  @ApiPropertyOptional()
  lowConfidence?: boolean;
}

export class ToggleParticipationDto {
  @IsBoolean()
  optIn!: boolean;

  // Required when opting in; ignored otherwise. Strict contract: opting in
  // without an intent must fail the request rather than silently default.
  @ValidateIf((dto: ToggleParticipationDto) => dto.optIn === true)
  @IsIn(WEEKLY_INTENTS)
  intent?: WeeklyIntent;
}

export class UpdateLocaleDto {
  @IsIn(SUPPORTED_LOCALES)
  locale!: SupportedLocale;
}

export class ContactMethodDto implements ContactMethodPayload {
  @IsIn(EDITABLE_CONTACT_CHANNEL_TYPES)
  type!: EditableContactChannelType;

  @IsString()
  @MaxLength(CONTACT_METHOD_VALUE_MAX_LENGTH)
  value!: string;
}

export class UpdateContactPreferencesDto implements Omit<
  ContactPreferencesPayload,
  'email'
> {
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;

  @IsIn(CONTACT_CHANNEL_TYPES)
  preferredContactChannel!: ContactChannelType;

  @IsArray()
  @ArrayMaxSize(EDITABLE_CONTACT_CHANNEL_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => ContactMethodDto)
  methods!: ContactMethodDto[];
}

export class ReportMatchDto {
  @IsIn(['骚扰', '冒犯内容', '身份异常', '恶意行为', '其他'])
  reason!: '骚扰' | '冒犯内容' | '身份异常' | '恶意行为' | '其他';

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(REPORT_DETAILS_MAX_LENGTH)
  details?: string;
}
