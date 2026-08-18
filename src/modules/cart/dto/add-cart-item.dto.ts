import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { PurchaseType } from '../../../entities';

export class AddCartItemDto {
  @IsInt()
  productVariantId: number;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsEnum(PurchaseType)
  purchaseType?: PurchaseType;

  @IsOptional()
  @IsInt()
  subscriptionFrequencyMonths?: number;
}
