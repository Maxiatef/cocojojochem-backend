import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoupons1786650500000 implements MigrationInterface {
  name = 'CreateCoupons1786650500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."coupons_type_enum" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT')`);
    await queryRunner.query(`
      CREATE TABLE "coupons" (
        "id" SERIAL NOT NULL,
        "code" character varying NOT NULL,
        "description" text,
        "type" "public"."coupons_type_enum" NOT NULL DEFAULT 'PERCENTAGE',
        "value" numeric(10,2) NOT NULL,
        "minOrderAmount" numeric(10,2),
        "maxDiscount" numeric(10,2),
        "startDate" TIMESTAMP WITH TIME ZONE,
        "endDate" TIMESTAMP WITH TIME ZONE,
        "usageLimit" integer,
        "usageCount" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "applicableToAllCategories" boolean NOT NULL DEFAULT true,
        "applicableToAllProducts" boolean NOT NULL DEFAULT true,
        "excludedCategoryIds" text,
        "excludedProductIds" text,
        "excludedVariantIds" text,
        "includedCategoryIds" text,
        "includedProductIds" text,
        "includedVariantIds" text,
        "maxUsagePerUser" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_coupons_code" UNIQUE ("code"),
        CONSTRAINT "PK_coupons_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coupon_usages" (
        "id" SERIAL NOT NULL,
        "couponId" integer NOT NULL,
        "orderId" integer,
        "email" character varying NOT NULL,
        "usedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_coupon_usages_orderId" UNIQUE ("orderId"),
        CONSTRAINT "PK_coupon_usages_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "coupon_usages"
      ADD CONSTRAINT "FK_coupon_usages_couponId" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "coupon_usages"
      ADD CONSTRAINT "FK_coupon_usages_orderId" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`ALTER TABLE "orders" ADD "couponId" integer`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "couponAmount" numeric(10,2) NOT NULL DEFAULT 0`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "couponAmount"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "couponId"`);
    await queryRunner.query(`ALTER TABLE "coupon_usages" DROP CONSTRAINT "FK_coupon_usages_orderId"`);
    await queryRunner.query(`ALTER TABLE "coupon_usages" DROP CONSTRAINT "FK_coupon_usages_couponId"`);
    await queryRunner.query(`DROP TABLE "coupon_usages"`);
    await queryRunner.query(`DROP TABLE "coupons"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
  }
}
