import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pricing a request and letting the customer buy it.
 *
 * - quote_requests.kind: ORDER (gave a delivery address — ready to buy) or
 *   QUOTE (pricing only). Existing rows with a destination become ORDER.
 * - The quote staff send back: per line quotedPrice / quotedPackSize /
 *   quotedQuantity / availability / quoteNote / isAvailable, and on the
 *   request quoteMessage, quotedShippingCost and quotedAt.
 * - quoteToken: the unguessable key in the customer's quote link
 *   (/quotes/<token>). Quotes do not expire.
 * - acceptedAt: the customer put the quoted lines in their cart.
 *   declinedAt / closeReason: why it was closed (customer or staff).
 * - quoteOrderId: the order the quoted lines were paid in. Separate from
 *   orderId, which is the order paid alongside the original request.
 * - pending_checkouts.quoteRequestIds: quotes being paid in a checkout.
 */
export class RequestQuotes1788980000000 implements MigrationInterface {
  name = 'RequestQuotes1788980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'QUOTE'`);
    await q(`UPDATE "quote_requests" SET "kind" = 'ORDER' WHERE "destination" IS NOT NULL AND "destination" <> ''`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "quoteToken" varchar(64)`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_quote_requests_quoteToken" ON "quote_requests" ("quoteToken")`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "quoteMessage" text`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "quotedShippingCost" numeric(10,2)`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "quotedAt" timestamptz`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "acceptedAt" timestamptz`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "declinedAt" timestamptz`);
    await q(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "closeReason" text`);
    await q(`
      ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "quoteOrderId" uuid
      REFERENCES "orders"("id") ON DELETE SET NULL`);

    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "quotedPrice" numeric(10,2)`);
    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "quotedPackSize" varchar(120)`);
    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "quotedQuantity" int`);
    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "availability" varchar(200)`);
    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "quoteNote" text`);
    await q(`ALTER TABLE "quote_request_items" ADD COLUMN IF NOT EXISTS "isAvailable" boolean NOT NULL DEFAULT true`);

    await q(`ALTER TABLE "pending_checkouts" ADD COLUMN IF NOT EXISTS "quoteRequestIds" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE "pending_checkouts" DROP COLUMN IF EXISTS "quoteRequestIds"`);
    for (const col of ['isAvailable', 'quoteNote', 'availability', 'quotedQuantity', 'quotedPackSize', 'quotedPrice']) {
      await q(`ALTER TABLE "quote_request_items" DROP COLUMN IF EXISTS "${col}"`);
    }
    await q(`DROP INDEX IF EXISTS "UQ_quote_requests_quoteToken"`);
    for (const col of [
      'quoteOrderId',
      'closeReason',
      'declinedAt',
      'acceptedAt',
      'quotedAt',
      'quotedShippingCost',
      'quoteMessage',
      'quoteToken',
      'kind',
    ]) {
      await q(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
