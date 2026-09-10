import { IsEmail, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Credentials for the public guest order-tracking lookup.
 *
 * Order id ALONE is deliberately not enough: ids are sequential, so anyone
 * could walk them and read other people's orders. Requiring the email that
 * placed the order means a caller has to already know both halves.
 */
export class GuestTrackDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderId: number;

  @IsEmail()
  email: string;
}
