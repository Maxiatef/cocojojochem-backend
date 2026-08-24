import { MigrationInterface, QueryRunner } from 'typeorm';

// The FK relation was always declared `onDelete: 'SET NULL'`, but the column
// itself was never made nullable — so deleting a ProductVariant that had ever
// been ordered violated the NOT NULL constraint (Postgres tries to null the
// column to satisfy the FK action, and fails). OrderItem already stores full
// snapshot fields (productName, variantLabel, sku, price, quantity), so the
// order stays fully readable even once its variant reference is nulled out.
export class OrderItemVariantNullable1787000300000 implements MigrationInterface {
  name = 'OrderItemVariantNullable1787000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "productVariantId" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "productVariantId" SET NOT NULL`);
  }
}
