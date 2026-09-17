import { IsEnum, IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { PurchaseType } from '../../../entities';

export class AddCartItemDto {
  @IsUUID('4')
  productVariantId: string;

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
