import { IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class AddQuoteListItemDto {
  @IsUUID('4')
  productId: string;

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
