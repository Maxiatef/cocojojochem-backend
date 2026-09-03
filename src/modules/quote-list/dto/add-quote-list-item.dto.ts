import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class AddQuoteListItemDto {
  @IsInt()
  productId: number;

  @IsString()
  productSlug: string;

  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  variantLabel?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsInt()
  @IsPositive()
  quantity: number;
}
