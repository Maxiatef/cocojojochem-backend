import { MigrationInterface, QueryRunner } from 'typeorm';

// Snapshot of the product/variant image at order time — same rationale as
// productName/variantLabel/sku already being snapshotted: survives even if
// the product/variant is later changed or deleted, so past orders keep
// showing the image the customer actually bought.
export class OrderItemImageSnapshot1787200000000 implements MigrationInterface {
  name = 'OrderItemImageSnapshot1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ADD "imageUrl" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "imageUrl"`);
  }
}
