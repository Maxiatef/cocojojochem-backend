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
import { StockStatus, ProductVisibility, DocType } from '../../../entities';

export class CreateVariantDto {
  // Identifies an EXISTING row so update() can patch it in place. Absent for
  // a row being added. Without it the server receives an anonymous list and
  // cannot tell an edit from a delete-plus-add, which is why this used to be
  // replaced wholesale on every save — detaching past order items from their
  // variant (OrderItem.productVariantId is ON DELETE SET NULL).
  @IsOptional()
  @IsInt()
  id?: number;

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

  // Visible/browsable immediately regardless; blocks add-to-cart/checkout for
  // THIS variant until this date arrives. Omit/null = available immediately.
  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  // Shipping weight in lb — used by the domestic zone+weight shipping table.
  @IsOptional()
  @IsNumber()
  weightLb?: number;

  // When true, this variant is priced via the drum shipping table (per-drum
  // flat rate by zone) instead of the regular per-lb weight table.
  @IsOptional()
  @IsBoolean()
  isSoldByDrum?: boolean;
}

export class ProductDocumentDto {
  // See CreateVariantDto.id — present for an existing row, absent for a new one.
  @IsOptional()
  @IsInt()
  id?: number;

  @IsString()
  url: string;

  @IsEnum(DocType)
  type: DocType;

  @IsOptional()
  @IsString()
  label?: string;

  // Which certification this file is the proof of. Only meaningful when
  // `type` is CERTIFICATE; ignored otherwise.
  @IsOptional()
  @IsInt()
  certificationId?: number;
}

export class GalleryImageDto {
  // See CreateVariantDto.id — present for an existing row, absent for a new one.
  @IsOptional()
  @IsInt()
  id?: number;

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
  // See CreateVariantDto.id — present for an existing row, absent for a new one.
  @IsOptional()
  @IsInt()
  id?: number;

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

  // Downloadable paperwork (COA / SDS / TDS / spec sheets) plus scanned
  // certificates, stored as ProductDocument rows. Deliberately NOT part of
  // `gallery`: create()/update() derive the product's cover `imageUrl` from
  // gallery[0].url, so a PDF landing first there would become the product
  // thumbnail across the whole storefront.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDocumentDto)
  documents?: ProductDocumentDto[];

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
