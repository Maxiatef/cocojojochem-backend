import { IsEmail, IsUUID } from 'class-validator';

/**
 * Credentials for the public guest order-tracking lookup.
 *
 * Order id ALONE is deliberately not enough. A uuid is unguessable, so this
 * is no longer the only thing standing between a caller and someone else's
 * order — but ids leak: they sit in links, receipts, browser history and
 * forwarded emails. Requiring the email that placed the order means holding
 * the id is not by itself permission to read it.
 */
export class GuestTrackDto {
  @IsUUID('4')
  orderId: string;

  @IsEmail()
  email: string;
}
