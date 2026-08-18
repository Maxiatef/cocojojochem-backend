import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutItemDto {
  @IsInt()
  productVariantId: number;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CheckoutDto {
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Guest-only fields (ignored if the request is authenticated)
  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @IsOptional()
  @IsBoolean()
  createAccount?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  // Guest cart items — required when the request is unauthenticated (guests have no DB cart)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  @IsOptional()
  @IsString()
  couponCode?: string;
}
