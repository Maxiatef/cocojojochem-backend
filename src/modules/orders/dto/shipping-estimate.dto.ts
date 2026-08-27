import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class ShippingEstimateItemDto {
  @IsInt()
  productVariantId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

// Pre-account shipping estimate request — country is the only field that's
// always required; state/zip matter only once we know enough to either
// confirm the $0 domestic case or attempt an international Shippo quote.
export class ShippingEstimateDto {
  @IsString()
  country: string; // ISO2

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShippingEstimateItemDto)
  items: ShippingEstimateItemDto[];
}
