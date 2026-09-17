import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foreign keys for quote_list_items.
 *
 * `userId` and `productId` always held real references, but no constraint
 * declared it. Two consequences, both real:
 *
 *  - Nothing stopped a row pointing at a user or product that no longer
 *    exists. Deleting either left the quote list holding a dead id, and the
 *    list silently rendered an item nobody could resolve.
 *  - A database client cannot follow a reference it has not been told about,
 *    so the columns read as bare uuids with no way to jump to the row.
 *
 * `wishlist_items` — the same shape of table, storing the same two references
 * — has carried both constraints since it was created. This brings the quote
 * list into line with it.
 *
 * ON DELETE CASCADE, matching wishlist_items: a quote list entry has no
 * meaning without the customer who saved it or the product it refers to, so
 * the row goes with them rather than being left behind pointing at nothing.
 *
 * `product_variants` is deliberately not referenced. The list is keyed by
 * productId plus a descriptive `variantLabel` rather than a real variant,
 * because a quote is a request for pricing rather than a purchase — see the
 * note on the QuoteListItem entity.
 */
export class QuoteListItemForeignKeys1788910000000 implements MigrationInterface {
  name = 'QuoteListItemForeignKeys1788910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Any row already pointing at something deleted would make the constraint
    // fail to validate, taking the whole migration with it. Cleared first —
    // these rows are unreachable either way, and CASCADE is what would have
    // removed them had the constraint existed at the time.
    await queryRunner.query(`
      DELETE FROM "quote_list_items" q
       WHERE NOT EXISTS (SELECT 1 FROM "users" u WHERE u.id = q."userId")
          OR NOT EXISTS (SELECT 1 FROM "products" p WHERE p.id = q."productId")
    `);

    await queryRunner.query(`
      ALTER TABLE "quote_list_items"
      ADD CONSTRAINT "FK_quote_list_items_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "quote_list_items"
      ADD CONSTRAINT "FK_quote_list_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
    `);

    // wishlist_items indexes userId for the same lookup; productId gets one
    // here too, because CASCADE on a product delete scans this column.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_quote_list_items_productId" ON "quote_list_items" ("productId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_quote_list_items_productId"`);
    await queryRunner.query(
      `ALTER TABLE "quote_list_items" DROP CONSTRAINT IF EXISTS "FK_quote_list_items_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quote_list_items" DROP CONSTRAINT IF EXISTS "FK_quote_list_items_user"`,
    );
  }
}
