import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  schoolYear?: string;

  @IsOptional()
  @IsString()
  programName?: string;

  @IsOptional()
  @IsString()
  pronouns?: string;

  @IsOptional()
  @IsString()
  hometown?: string;

  @IsOptional()
  @IsString()
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
  @IsBoolean()
  allowCrossSchool?: boolean;

  @IsOptional()
  @IsBoolean()
  preferCrossSchool?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interestedIn?: string[];
}

export class SaveQuestionnaireDto {
  @IsObject()
  answers!: Record<string, unknown>;
}

export class ToggleParticipationDto {
  @IsBoolean()
  optIn!: boolean;
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
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  details?: string;
}
