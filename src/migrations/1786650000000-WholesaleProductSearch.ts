import { MigrationInterface, QueryRunner } from 'typeorm';

// Ports the real cocojojo.com wholesale full-text/trigram search setup:
// a weighted generated tsvector column plus trigram GIN indexes across the
// fields buyers actually search by (name, sku, slug, CAS number, INCI name,
// botanical name), and a plain tsvector GIN index for ranked full-text search.
export class WholesaleProductSearch1786650000000 implements MigrationInterface {
  name = 'WholesaleProductSearch1786650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "search_vector" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("sku", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("slug", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("casNumber", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("inciName", '')), 'B') ||
        setweight(to_tsvector('english', coalesce("botanicalName", '')), 'B') ||
        setweight(to_tsvector('english', coalesce("shortDescription", '')), 'C') ||
        setweight(to_tsvector('english', coalesce("chemicalDescriptions", '')), 'D')
      ) STORED
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_search_vector_idx" ON "products" USING GIN ("search_vector")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_sku_trgm_idx" ON "products" USING GIN ("sku" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_slug_trgm_idx" ON "products" USING GIN ("slug" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_cas_number_trgm_idx" ON "products" USING GIN ("casNumber" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_inci_name_trgm_idx" ON "products" USING GIN ("inciName" gin_trgm_ops)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "wholesale_product_botanical_name_trgm_idx" ON "products" USING GIN ("botanicalName" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_botanical_name_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_inci_name_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_cas_number_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_slug_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_sku_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_name_trgm_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "wholesale_product_search_vector_idx"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "search_vector"`);
  }
}
