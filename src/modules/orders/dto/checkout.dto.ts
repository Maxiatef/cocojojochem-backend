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

  // Last shipping cost returned by POST /orders/shipping-estimate for this
  // cart/address — passed through so the actual Stripe charge matches what
  // the checkout UI showed. Server never recomputes it here (no address
  // structure is stored on Order to recompute from), so it trusts this value
  // the same way it already trusts shippingAddress/notes as free text; the
  // real financial guard is that Stripe collects exactly total = subtotal -
  // couponAmount + shippingCost, which is auditable per order.
  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;
}
