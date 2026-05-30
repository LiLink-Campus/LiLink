import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BROWSER_PRODUCT_EVENT_KINDS,
  PRODUCT_EVENT_NAMES,
} from '@lilink/shared';

const EVENT_ID_MAX_LENGTH = 96;
const SHORT_ID_MAX_LENGTH = 128;
const ROUTE_MAX_LENGTH = 256;
const SURFACE_MAX_LENGTH = 128;
const ENTITY_TYPE_MAX_LENGTH = 64;

export class CreateProductEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(EVENT_ID_MAX_LENGTH)
  eventId!: string;

  @IsIn([...PRODUCT_EVENT_NAMES])
  name!: string;

  @IsIn([...BROWSER_PRODUCT_EVENT_KINDS])
  kind!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  eventVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_ID_MAX_LENGTH)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_ID_MAX_LENGTH)
  intentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_ID_MAX_LENGTH)
  correlationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ROUTE_MAX_LENGTH)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SURFACE_MAX_LENGTH)
  surface?: string;

  @IsOptional()
  @IsString()
  @MaxLength(ENTITY_TYPE_MAX_LENGTH)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SHORT_ID_MAX_LENGTH)
  entityId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}
