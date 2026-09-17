import { IsUUID } from 'class-validator';

export class AddWishlistItemDto {
  @IsUUID('4')
  productId: string;
}
