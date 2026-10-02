import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const QUOTE_LINE_SOURCES = ['COCOJOJO', 'SUPPLIER_REFERENCE'] as const;
export type QuoteLineSource = (typeof QUOTE_LINE_SOURCES)[number];

export class AddQuoteListItemDto {
  // COCOJOJO (default) = a product in our catalog; SUPPLIER_REFERENCE = an
  // entry from the storefront's supplier reference library, identified by
  // referenceCode instead of a product id.
  @IsOptional()
  @IsIn(QUOTE_LINE_SOURCES)
  source?: QuoteLineSource;

  @ValidateIf((o) => o.source !== 'SUPPLIER_REFERENCE')
  @IsUUID('4')
  productId?: string | null;

  @ValidateIf((o) => o.source === 'SUPPLIER_REFERENCE')
  @IsString()
  @MaxLength(120)
  referenceCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string | null;

  @IsString()
  @MaxLength(200)
  productSlug: string;

  @IsString()
  @MaxLength(300)
  productName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  variantLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsInt()
  @IsPositive()
  quantity: number;
}

export class MergeQuoteListDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AddQuoteListItemDto)
  items: AddQuoteListItemDto[];
}
