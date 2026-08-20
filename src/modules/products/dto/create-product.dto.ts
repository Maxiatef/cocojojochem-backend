import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { StockStatus } from '../../../entities';

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

  // Optional explicit override — only meaningful for ON_BACKORDER (a deliberate
  // merchandising choice an admin makes). IN_STOCK/OUT_OF_STOCK are otherwise
  // auto-derived from stockQuantity in ProductsService — see resolveStockStatus().
  @IsOptional()
  @IsEnum(StockStatus)
  stockStatus?: StockStatus;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  moq?: number;
}

export class GalleryImageDto {
  @IsString()
  url: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
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

  // Extra gallery images beyond the single main `imageUrl` — stored as
  // ProductImage rows (each `url` is a local /uploads/gallery/... path from
  // POST /uploads/multiple-images, same disk-upload flow as the main image).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GalleryImageDto)
  gallery?: GalleryImageDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}
