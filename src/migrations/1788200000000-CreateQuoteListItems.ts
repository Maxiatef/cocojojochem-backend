import { MigrationInterface, QueryRunner } from 'typeorm';

// Server-side per-account quote list, mirroring the carts/cart_items shape
// — replaces the old localStorage-only quote list, which persisted across
// logout/login on the same device (bug: a customer's quote list leaked to
// whoever used the browser next).
export class CreateQuoteListItems1788200000000 implements MigrationInterface {
  name = 'CreateQuoteListItems1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "quote_list_items" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "productId" integer NOT NULL,
        "productSlug" character varying NOT NULL,
        "productName" character varying NOT NULL,
        "variantLabel" character varying,
        "imageUrl" character varying,
        "quantity" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_quote_list_items_userId" ON "quote_list_items" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "quote_list_items"`);
  }
}
