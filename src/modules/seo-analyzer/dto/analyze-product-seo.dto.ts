import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * A product DRAFT to score. Every field is optional except the two the
 * analyser cannot work without, because this is called from a half-filled
 * form — an admin should get feedback before the product is valid, not after.
 */
export class AnalyzeProductSeoDto {
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  chemicalDescriptions?: string;

  @IsOptional()
  @IsString()
  inciName?: string;

  @IsOptional()
  @IsString()
  casNumber?: string;

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
  @IsInt()
  @Min(0)
  imageCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  imagesWithAlt?: number;
}
