import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the quote list and submitted requests carry supplier-reference
 * materials (the MakingCosmetics reference library on the storefront), which
 * are not products in our catalog.
 *
 * - quote_list_items.productId becomes nullable; a reference line is
 *   identified by `referenceCode` instead. Exactly one of the two is set.
 * - Both line tables gain `source` (COCOJOJO | SUPPLIER_REFERENCE),
 *   `referenceCode` and `sourceUrl` (the supplier's original listing).
 * - quote_requests gains `destination` (shipping city/state/country), which
 *   the order-request form collects.
 * - Combined checkout (pay for priced items, request pricing for the rest):
 *   quote_requests gains `paymentRequested` and `orderId`, and
 *   pending_checkouts gains `quoteRequestId`. The request is created first;
 *   the Stripe webhook sets `orderId` once payment is confirmed. A request
 *   with paymentRequested and no orderId means payment was not completed.
 */
export class SupplierReferenceRequests1788970000000 implements MigrationInterface {
  name = 'SupplierReferenceRequests1788970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['quote_list_items', 'quote_request_items']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "source" varchar(32) NOT NULL DEFAULT 'COCOJOJO'`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "referenceCode" varchar(120)`);
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "sourceUrl" varchar(500)`);
    }
    await queryRunner.query(`ALTER TABLE "quote_list_items" ALTER COLUMN "productId" DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "quote_list_items" ADD CONSTRAINT "CHK_quote_list_items_target"
      CHECK ("productId" IS NOT NULL OR "referenceCode" IS NOT NULL)`);
    await queryRunner.query(`ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "destination" varchar(600)`);
    await queryRunner.query(
      `ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "paymentRequested" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`
      ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "orderId" uuid
      REFERENCES "orders"("id") ON DELETE SET NULL`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_requests_orderId" ON "quote_requests" ("orderId")`,
    );
    await queryRunner.query(`ALTER TABLE "pending_checkouts" ADD COLUMN IF NOT EXISTS "quoteRequestId" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "pending_checkouts" DROP COLUMN IF EXISTS "quoteRequestId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_requests_orderId"`);
    await queryRunner.query(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "orderId"`);
    await queryRunner.query(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "paymentRequested"`);
    await queryRunner.query(`ALTER TABLE "quote_requests" DROP COLUMN IF EXISTS "destination"`);
    await queryRunner.query(`ALTER TABLE "quote_list_items" DROP CONSTRAINT IF EXISTS "CHK_quote_list_items_target"`);
    await queryRunner.query(`DELETE FROM "quote_list_items" WHERE "productId" IS NULL`);
    await queryRunner.query(`ALTER TABLE "quote_list_items" ALTER COLUMN "productId" SET NOT NULL`);
    for (const table of ['quote_list_items', 'quote_request_items']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "sourceUrl"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "referenceCode"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "source"`);
    }
  }
}
