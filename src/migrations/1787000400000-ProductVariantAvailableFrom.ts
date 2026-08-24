import { MigrationInterface, QueryRunner } from 'typeorm';

// Lets a variant stay fully visible/browsable while being not-yet-purchasable
// until a future date (distinct from Product.scheduledPublishAt, which hides
// the whole product). Enforced in cart.service.ts and orders.service.ts.
export class ProductVariantAvailableFrom1787000400000 implements MigrationInterface {
  name = 'ProductVariantAvailableFrom1787000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "availableFrom" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "availableFrom"`);
  }
}
