import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ValidateCouponCartItemDto {
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsInt()
  variantId?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsString()
  brand?: string;

  // Trusted client-supplied flag (same pattern as categoryId/productId etc.)
  // reflecting whatever isSaleActive() (common/pricing.util.ts) computed for
  // this cart line's variant — the cart item DTO has no price-history fields
  // to re-derive sale status from server-side.
  @IsOptional()
  @IsBoolean()
  isOnSale?: boolean;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class ValidateCouponDto {
  @IsString()
  code: string;

  @IsNumber()
  @Min(0)
  orderAmount: number;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidateCouponCartItemDto)
  cartItems?: ValidateCouponCartItemDto[];
}
