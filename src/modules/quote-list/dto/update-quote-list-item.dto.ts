import { IsInt, IsPositive } from 'class-validator';

export class UpdateQuoteListItemDto {
  @IsInt()
  @IsPositive()
  quantity: number;
}
