import { MigrationInterface, QueryRunner } from 'typeorm';

// Admin-configurable shipping zones + methods (flat rate / free shipping) —
// evaluated before falling back to the existing hardcoded rate-table logic.
export class CreateShippingZones1787600000000 implements MigrationInterface {
  name = 'CreateShippingZones1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "shipping_methods"`);
    await queryRunner.query(`DROP TYPE "shipping_methods_type_enum"`);
    await queryRunner.query(`DROP TABLE "shipping_zones"`);
  }
}
