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
  maxOrderAmount?: number;

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
  excludedCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  excludedProductIds?: string[];

  @IsOptional()
  @IsArray()
  excludedVariantIds?: string[];

  @IsOptional()
  @IsArray()
  includedCategoryIds?: string[];

  @IsOptional()
  @IsArray()
  includedProductIds?: string[];

  @IsOptional()
  @IsArray()
  includedVariantIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsagePerUser?: number;

  @IsOptional()
  @IsBoolean()
  allowFreeShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  individualUseOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeSaleItems?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmails?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  limitUsageToXItems?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedBrands?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedBrands?: string[];
}
