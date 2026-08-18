import { MigrationInterface, QueryRunner } from 'typeorm';

// Aligns ProductVariant.stockStatus with the real cocojojo.com wholesale enum:
// drops LOW_STOCK (never used there) and renames BACKORDER -> ON_BACKORDER.
export class WholesaleStockStatusAlign1786650100000 implements MigrationInterface {
  name = 'WholesaleStockStatusAlign1786650100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "product_variants" SET "stockStatus" = 'IN_STOCK' WHERE "stockStatus" = 'LOW_STOCK'`,
    );

    await queryRunner.query(
      `ALTER TYPE "public"."product_variants_stockstatus_enum" RENAME TO "product_variants_stockstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_variants_stockstatus_enum" AS ENUM('IN_STOCK', 'OUT_OF_STOCK', 'ON_BACKORDER')`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ALTER COLUMN "stockStatus" DROP DEFAULT,
      ALTER COLUMN "stockStatus" TYPE "public"."product_variants_stockstatus_enum"
        USING (
          CASE "stockStatus"::text
            WHEN 'BACKORDER' THEN 'ON_BACKORDER'
            ELSE "stockStatus"::text
          END
        )::"public"."product_variants_stockstatus_enum",
      ALTER COLUMN "stockStatus" SET DEFAULT 'IN_STOCK'
    `);
    await queryRunner.query(`DROP TYPE "public"."product_variants_stockstatus_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."product_variants_stockstatus_enum" RENAME TO "product_variants_stockstatus_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_variants_stockstatus_enum" AS ENUM('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'BACKORDER')`,
    );
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ALTER COLUMN "stockStatus" DROP DEFAULT,
      ALTER COLUMN "stockStatus" TYPE "public"."product_variants_stockstatus_enum"
        USING (
          CASE "stockStatus"::text
            WHEN 'ON_BACKORDER' THEN 'BACKORDER'
            ELSE "stockStatus"::text
          END
        )::"public"."product_variants_stockstatus_enum",
      ALTER COLUMN "stockStatus" SET DEFAULT 'IN_STOCK'
    `);
    await queryRunner.query(`DROP TYPE "public"."product_variants_stockstatus_enum_old"`);
  }
}
