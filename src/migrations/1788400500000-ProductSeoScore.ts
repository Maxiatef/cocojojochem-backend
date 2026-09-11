import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores the per-product SEO score computed by analyzeProductSeo().
 *
 * The score is also computed live in the admin editor from the same function,
 * so this column is a cache for listing and filtering — "show me every product
 * scoring under 50" — not a second source of truth.
 *
 * Nullable with no backfill: a product that has never been saved since this
 * shipped genuinely has no score yet, and showing "—" is honest where showing
 * 0 would read as "this product is terrible".
 */
export class ProductSeoScore1788400500000 implements MigrationInterface {
  name = 'ProductSeoScore1788400500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_seo" ADD COLUMN "seoScore" INTEGER`);
    await queryRunner.query(`ALTER TABLE "product_seo" ADD COLUMN "seoCheckedAt" TIMESTAMPTZ`);
    // Partial index for the "worst products first" view; scored rows are the
    // only ones that view cares about.
    await queryRunner.query(
      `CREATE INDEX "IDX_product_seo_score" ON "product_seo" ("seoScore") WHERE "seoScore" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_product_seo_score"`);
    await queryRunner.query(`ALTER TABLE "product_seo" DROP COLUMN IF EXISTS "seoCheckedAt"`);
    await queryRunner.query(`ALTER TABLE "product_seo" DROP COLUMN IF EXISTS "seoScore"`);
  }
}
