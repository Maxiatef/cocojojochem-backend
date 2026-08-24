import { Type } from 'class-transformer';
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
  ValidateNested,
} from 'class-validator';
import { StockStatus, ProductVisibility } from '../../../entities';

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

  // Per-variant override for the global low-stock threshold (10). When set,
  // this variant is flagged "running low" at this quantity instead.
  @IsOptional()
  @IsInt()
  @Min(1)
  lowStockThreshold?: number;

  // Custom per-variant order cap (not WooCommerce's "sold individually").
  @IsOptional()
  @IsBoolean()
  limitPerOrder?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxOrderQuantity?: number;
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

export class ProductSpecDto {
  @IsString()
  key: string;

  @IsString()
  value: string;
}

export class ProductSeoDto {
  @IsOptional()
  @IsString()
  focusKeyphrase?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  socialTitle?: string;

  @IsOptional()
  @IsString()
  socialDescription?: string;

  @IsOptional()
  @IsString()
  socialImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
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
  isPublished?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsEnum(ProductVisibility)
  visibility?: ProductVisibility;

  @IsOptional()
  @IsString()
  visibilityPassword?: string;

  @IsOptional()
  @IsDateString()
  scheduledPublishAt?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs?: ProductSpecDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ProductSeoDto)
  seo?: ProductSeoDto;
}
