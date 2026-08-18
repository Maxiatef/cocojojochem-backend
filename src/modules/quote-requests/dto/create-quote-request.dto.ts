import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RequestType } from '../../../entities';

class QuoteRequestItemDto {
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsString()
  productName: string;

  @IsOptional()
  @IsInt()
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateQuoteRequestDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteRequestItemDto)
  items?: QuoteRequestItemDto[];
}
