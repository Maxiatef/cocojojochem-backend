import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the country-list "Shipping Zones" feature (flat-rate/free-shipping
// methods per country list) with a simpler, fully admin-controlled model:
// one shipping amount per US state (this table), a default amount and a
// flat international amount (both plain site_settings keys, no table
// needed). Drops the now-unused shipping_zones/shipping_methods tables.
export class RefactorShippingToStateRates1787700000000 implements MigrationInterface {
  name = 'RefactorShippingToStateRates1787700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "shipping_methods"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "shipping_methods_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipping_zones"`);

    await queryRunner.query(`
      CREATE TABLE "state_shipping_rates" (
        "id" SERIAL PRIMARY KEY,
        "stateCode" varchar(2) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_state_shipping_rates_stateCode" ON "state_shipping_rates" ("stateCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "state_shipping_rates"`);

    // Best-effort recreate of the dropped tables, matching the original
    // 1787600000000-CreateShippingZones migration.
    await queryRunner.query(`
      CREATE TABLE "shipping_zones" (
        "id" SERIAL PRIMARY KEY,
        "name" varchar NOT NULL,
        "countries" text[] NOT NULL DEFAULT '{}',
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE TYPE "shipping_methods_type_enum" AS ENUM ('FLAT_RATE', 'FREE_SHIPPING')`);
    await queryRunner.query(`
      CREATE TABLE "shipping_methods" (
        "id" SERIAL PRIMARY KEY,
        "zoneId" integer NOT NULL,
        "type" "shipping_methods_type_enum" NOT NULL,
        "title" varchar NOT NULL,
        "cost" numeric(10,2) NOT NULL DEFAULT '0.00',
        "minOrderForFree" numeric(10,2),
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_shipping_methods_zone" FOREIGN KEY ("zoneId") REFERENCES "shipping_zones"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_shipping_methods_zoneId" ON "shipping_methods" ("zoneId")`);
  }
}
