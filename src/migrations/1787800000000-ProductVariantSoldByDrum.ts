import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds ProductVariant.isSoldByDrum — marks a variant as priced via the drum
// shipping rate table (per-drum flat rate by zone) instead of the regular
// per-lb weight table. See shipping-drum-tiers.constants.ts.
export class ProductVariantSoldByDrum1787800000000 implements MigrationInterface {
  name = 'ProductVariantSoldByDrum1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "isSoldByDrum" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "isSoldByDrum"`);
  }
}
