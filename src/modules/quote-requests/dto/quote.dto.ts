import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequestStatus } from '../../../entities';

export class UpdateStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;

  // Shown to the customer in the "request closed" email (LOST only).
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class QuoteLineDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  quotedPrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  quotedPackSize?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  quotedQuantity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  availability?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  quoteNote?: string | null;

  @IsBoolean()
  isAvailable: boolean;
}

export class SaveQuoteDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  items: QuoteLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  quoteMessage?: string | null;

  // Null/omitted = shipping calculated at checkout.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  quotedShippingCost?: number | null;

  // true = email the quote to the customer and mark the request QUOTED;
  // false = save as a draft.
  @IsBoolean()
  send: boolean;
}

export class DeclineQuoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
