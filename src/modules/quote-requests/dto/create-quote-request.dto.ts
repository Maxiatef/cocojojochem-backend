import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { RequestType } from '../../../entities';
import { QUOTE_LINE_SOURCES, QuoteLineSource } from '../../quote-list/dto/add-quote-list-item.dto';

class QuoteRequestItemDto {
  @IsOptional()
  @IsUUID('4')
  productId?: string;

  @IsString()
  @MaxLength(300)
  productName: string;

  @IsOptional()
  @IsInt()
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(QUOTE_LINE_SOURCES)
  source?: QuoteLineSource;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;
}

export class CreateQuoteRequestDto {
  @IsString()
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  // Shipping city, state and country (order-request form).
  @IsOptional()
  @IsString()
  @MaxLength(600)
  destination?: string;

  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteRequestItemDto)
  items?: QuoteRequestItemDto[];

  // ORDER = ready to buy (needs a destination); QUOTE = pricing only.
  @IsOptional()
  @IsIn(['ORDER', 'QUOTE'])
  kind?: 'ORDER' | 'QUOTE';

  // True when the customer is also paying for priced items in the same
  // checkout; the order is linked to this request once Stripe confirms.
  @IsOptional()
  @IsBoolean()
  withPayment?: boolean;

  // Honeypot: a hidden field people never fill in. Anything here is a bot.
  @IsOptional()
  @IsString()
  website?: string;
}
