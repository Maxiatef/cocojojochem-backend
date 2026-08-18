import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CouponType } from '../../../entities';

export class CreateCouponDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(CouponType)
  type: CouponType;

  @IsNumber()
  @Min(0)
  value: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  applicableToAllCategories?: boolean;

  @IsOptional()
  @IsBoolean()
  applicableToAllProducts?: boolean;

  @IsOptional()
  @IsArray()
  excludedCategoryIds?: number[];

  @IsOptional()
  @IsArray()
  excludedProductIds?: number[];

  @IsOptional()
  @IsArray()
  excludedVariantIds?: number[];

  @IsOptional()
  @IsArray()
  includedCategoryIds?: number[];

  @IsOptional()
  @IsArray()
  includedProductIds?: number[];

  @IsOptional()
  @IsArray()
  includedVariantIds?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsagePerUser?: number;
}
