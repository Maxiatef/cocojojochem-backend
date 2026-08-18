import { Type } from 'class-transformer';
import {
  IsArray,
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
