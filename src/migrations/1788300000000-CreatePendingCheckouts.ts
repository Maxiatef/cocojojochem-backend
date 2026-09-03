import { MigrationInterface, QueryRunner } from 'typeorm';

// Holds everything needed to create an Order once Stripe confirms payment —
// see PendingCheckout entity doc. Order creation moves out of the checkout
// endpoint and into the Stripe webhook handler as part of this same change.
export class CreatePendingCheckouts1788300000000 implements MigrationInterface {
  name = 'CreatePendingCheckouts1788300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_checkouts" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer,
        "guestEmail" character varying,
        "guestName" character varying,
        "guestPhone" character varying,
        "itemsJson" text NOT NULL,
        "subtotal" numeric(12,2) NOT NULL,
        "shippingCost" numeric(10,2) NOT NULL DEFAULT '0.00',
        "taxAmount" numeric(10,2) NOT NULL DEFAULT '0.00',
        "couponId" integer,
        "couponAmount" numeric(10,2) NOT NULL DEFAULT '0.00',
        "shippingAddress" text,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pending_checkouts"`);
  }
}
