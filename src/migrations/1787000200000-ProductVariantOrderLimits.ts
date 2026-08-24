import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductVariantOrderLimits1787000200000 implements MigrationInterface {
  name = 'ProductVariantOrderLimits1787000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      ADD "lowStockThreshold" integer,
      ADD "limitPerOrder" boolean NOT NULL DEFAULT false,
      ADD "maxOrderQuantity" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
      DROP COLUMN "maxOrderQuantity",
      DROP COLUMN "limitPerOrder",
      DROP COLUMN "lowStockThreshold"
    `);
  }
}
