import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  sku: string;

  @IsString()
  label: string;

  @IsNumber()
  price: number;

  @IsOptional()
  @IsNumber()
  salePrice?: number;

  @IsOptional()
  @IsInt()
  stockQuantity?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  moq?: number;
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  sku: string;

  @IsOptional()
  @IsString()
  inciName?: string;

  @IsOptional()
  @IsString()
  botanicalName?: string;

  @IsOptional()
  @IsString()
  casNumber?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  chemicalDescriptions?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsInt()
  categoryId: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  functionIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  certificationIds?: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
