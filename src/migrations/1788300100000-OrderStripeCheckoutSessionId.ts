import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderStripeCheckoutSessionId1788300100000 implements MigrationInterface {
  name = 'OrderStripeCheckoutSessionId1788300100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "stripeCheckoutSessionId" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_orders_stripeCheckoutSessionId" ON "orders" ("stripeCheckoutSessionId") WHERE "stripeCheckoutSessionId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_stripeCheckoutSessionId"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "stripeCheckoutSessionId"`);
  }
}
