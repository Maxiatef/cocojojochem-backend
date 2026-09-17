import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foreign key for quote_request_items.productId.
 *
 * The sibling column `quoteRequestId` has been constrained since the table
 * was created; `productId` never was, so it read as a bare uuid with nothing
 * to follow and nothing stopping it pointing at a deleted product.
 *
 * ON DELETE SET NULL, NOT cascade. QuoteRequestItem snapshots `productName`
 * precisely so a submitted request survives the product being deleted — the
 * entity says as much on that column. Cascading would throw away the request
 * itself, which is a customer's enquiry and a record of what was asked for.
 * Nulling the link keeps the enquiry and loses only the pointer, matching how
 * OrderItem.productVariantId already behaves.
 *
 * The column stays nullable: an item can legitimately name a product that is
 * not in the catalogue, which is a large part of what a quote request is for.
 */
export class QuoteRequestItemProductFk1788920000000 implements MigrationInterface {
  name = 'QuoteRequestItemProductFk1788920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A row pointing at a product that no longer exists would fail validation
    // and roll the migration back. Nulled rather than deleted — that is what
    // the constraint itself would have done at the time, and the request's
    // own productName snapshot means nothing readable is lost.
    await queryRunner.query(`
      UPDATE "quote_request_items" q SET "productId" = NULL
       WHERE q."productId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "products" p WHERE p.id = q."productId")
    `);

    await queryRunner.query(`
      ALTER TABLE "quote_request_items"
      ADD CONSTRAINT "FK_quote_request_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL
    `);

    // Deleting a product has to find the rows to null, and that is a scan
    // without this. Partial, because most rows carry no product at all.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_quote_request_items_productId"
        ON "quote_request_items" ("productId") WHERE "productId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_request_items_productId"`);
    await queryRunner.query(
      `ALTER TABLE "quote_request_items" DROP CONSTRAINT IF EXISTS "FK_quote_request_items_product"`,
    );
  }
}
