import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export type ProductSort = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'newest';

// Mirrors + extends the query shape observed on the live cocojojo.com wholesale API
export class QueryProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  functionSlug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  certificationId?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @IsString()
  inStockOnly?: string; // "true"/"false" via query string

  @IsOptional()
  @IsIn(['name_asc', 'name_desc', 'price_asc', 'price_desc', 'newest'])
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;
}
