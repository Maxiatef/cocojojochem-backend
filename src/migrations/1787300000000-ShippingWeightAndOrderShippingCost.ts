import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds ProductVariant.weightLb (shipping weight, used to compute Shippo
// parcel weight for international rate estimates) and Order.shippingCost
// (the actual shipping amount charged, computed by /orders/shipping-estimate
// and passed through checkout so Stripe collects it).
export class ShippingWeightAndOrderShippingCost1787300000000 implements MigrationInterface {
  name = 'ShippingWeightAndOrderShippingCost1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD "weightLb" numeric(10,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shippingCost" numeric(10,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shippingCost"`);
    await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "weightLb"`);
  }
}
