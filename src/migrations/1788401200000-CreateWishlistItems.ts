import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWishlistItems1788401200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "wishlist_items" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "productId" integer NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wishlist_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_wishlist_items_userId" ON "wishlist_items" ("userId")`,
    );

    // One row per product per customer. Saving a product that is already saved
    // is then a no-op at the database level rather than a duplicate row.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_wishlist_user_product" ON "wishlist_items" ("userId", "productId")`,
    );

    // Deleting a customer or a product clears their saved rows with it: a
    // wishlist entry pointing at something that no longer exists has nothing
    // to render.
    await queryRunner.query(`
      ALTER TABLE "wishlist_items"
      ADD CONSTRAINT "FK_wishlist_items_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "wishlist_items"
      ADD CONSTRAINT "FK_wishlist_items_product"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wishlist_items"`);
  }
}
