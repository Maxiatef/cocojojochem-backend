import { IsInt } from 'class-validator';

export class AddWishlistItemDto {
  @IsInt()
  productId: number;
}
