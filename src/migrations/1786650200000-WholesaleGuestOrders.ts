import { MigrationInterface, QueryRunner } from 'typeorm';

// Enables guest checkout (mirrors real cocojojo.com): orders no longer require
// an account. Drops NOT NULL on orders.userId and adds guest contact columns.
export class WholesaleGuestOrders1786650200000 implements MigrationInterface {
  name = 'WholesaleGuestOrders1786650200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "userId" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "guestEmail" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "guestName" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "guestPhone" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guestPhone"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guestName"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guestEmail"`);
    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "userId" SET NOT NULL`);
  }
}
