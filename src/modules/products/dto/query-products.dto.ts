import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

// Admin-only sort keys (sku_*, category_*, variants_*, stock_*, status_*) are
// accepted by findAllAdmin's plain @Query('sort') param, not by this DTO's
// @IsIn-validated public `sort` field below — kept in the same union purely
// so both endpoints can share one type.
export type ProductSort =
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'newest'
  | 'sku_asc'
  | 'sku_desc'
  | 'category_asc'
  | 'category_desc'
  | 'variants_asc'
  | 'variants_desc'
  | 'stock_asc'
  | 'stock_desc'
  | 'status_asc'
  | 'status_desc';

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
