import { IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBulkSaleDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  categoryIds?: number[];

  @IsOptional()
  @IsArray()
  productIds?: number[];

  @IsOptional()
  @IsArray()
  variantIds?: number[];

  @IsOptional()
  @IsBoolean()
  applyToAllVariants?: boolean;
}
