import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds Order.taxAmount — the actual tax charged, computed server-side from
// the admin-set `tax.value` site setting (percentage) applied to the order
// subtotal at checkout. Previously the admin Tax tab saved a rate that
// nothing ever read; this column is what finally makes it apply.
export class OrderTaxAmount1788100000000 implements MigrationInterface {
  name = 'OrderTaxAmount1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "taxAmount" numeric(10,2) NOT NULL DEFAULT '0.00'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "taxAmount"`);
  }
}
