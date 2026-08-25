import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces the 2-value coupons_type_enum (PERCENTAGE | FIXED_AMOUNT) with a
// 4-value enum (PERCENTAGE_CART | PERCENTAGE_PRODUCT | FIXED_CART |
// FIXED_PRODUCT), migrating existing data, and adds the new WooCommerce-
// parity + custom-extension columns to "coupons".
//
// Postgres can't rename enum values that don't literally match, so this
// does the standard create-new-type / migrate-data / alter-column /
// drop-old-type dance instead of a naive ALTER TYPE ... RENAME VALUE.
export class CouponDiscountTypeSplitAndRestrictions1787000500000 implements MigrationInterface {
  name = 'CouponDiscountTypeSplitAndRestrictions1787000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."coupons_type_enum_new" AS ENUM('PERCENTAGE_CART', 'PERCENTAGE_PRODUCT', 'FIXED_CART', 'FIXED_PRODUCT')`,
    );
    await queryRunner.query(`ALTER TABLE "coupons" ADD COLUMN "type_new" "public"."coupons_type_enum_new"`);
    await queryRunner.query(
      `UPDATE "coupons" SET "type_new" = CASE "type"::text WHEN 'PERCENTAGE' THEN 'PERCENTAGE_CART' WHEN 'FIXED_AMOUNT' THEN 'FIXED_CART' END::"public"."coupons_type_enum_new"`,
    );
    await queryRunner.query(`ALTER TABLE "coupons" ALTER COLUMN "type_new" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "coupons" ALTER COLUMN "type_new" SET DEFAULT 'PERCENTAGE_CART'`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "coupons" RENAME COLUMN "type_new" TO "type"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
    await queryRunner.query(`ALTER TYPE "public"."coupons_type_enum_new" RENAME TO "coupons_type_enum"`);

    await queryRunner.query(`ALTER TABLE "coupons" ADD "maxOrderAmount" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "allowFreeShipping" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "individualUseOnly" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "excludeSaleItems" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "allowedEmails" text array`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "limitUsageToXItems" integer`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "includedBrands" text array`);
    await queryRunner.query(`ALTER TABLE "coupons" ADD "excludedBrands" text array`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "excludedBrands"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "includedBrands"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "limitUsageToXItems"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "allowedEmails"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "excludeSaleItems"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "individualUseOnly"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "allowFreeShipping"`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "maxOrderAmount"`);

    await queryRunner.query(
      `CREATE TYPE "public"."coupons_type_enum_old" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT')`,
    );
    await queryRunner.query(`ALTER TABLE "coupons" ADD COLUMN "type_old" "public"."coupons_type_enum_old"`);
    await queryRunner.query(
      `UPDATE "coupons" SET "type_old" = CASE "type"::text WHEN 'PERCENTAGE_CART' THEN 'PERCENTAGE' WHEN 'PERCENTAGE_PRODUCT' THEN 'PERCENTAGE' WHEN 'FIXED_CART' THEN 'FIXED_AMOUNT' WHEN 'FIXED_PRODUCT' THEN 'FIXED_AMOUNT' END::"public"."coupons_type_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "coupons" ALTER COLUMN "type_old" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "coupons" ALTER COLUMN "type_old" SET DEFAULT 'PERCENTAGE'`);
    await queryRunner.query(`ALTER TABLE "coupons" DROP COLUMN "type"`);
    await queryRunner.query(`ALTER TABLE "coupons" RENAME COLUMN "type_old" TO "type"`);
    await queryRunner.query(`DROP TYPE "public"."coupons_type_enum"`);
    await queryRunner.query(`ALTER TYPE "public"."coupons_type_enum_old" RENAME TO "coupons_type_enum"`);
  }
}
