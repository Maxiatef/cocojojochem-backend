import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds provider reference columns to orders, used by the Stripe/ShipStation/
// Shippo webhook listeners (WebhooksModule) to look up which order an
// incoming event applies to once those integrations are actually connected.
export class WholesaleShippingProviderRefs1786650300000 implements MigrationInterface {
  name = 'WholesaleShippingProviderRefs1786650300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD "stripePaymentIntentId" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "shipstationOrderId" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "shippoTrackingNumber" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "trackingNumber" character varying`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "carrierCode" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "carrierCode"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "trackingNumber"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shippoTrackingNumber"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shipstationOrderId"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "stripePaymentIntentId"`);
  }
}
