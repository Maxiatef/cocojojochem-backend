import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBulkSaleDiscounts1786650600000 implements MigrationInterface {
  name = 'CreateBulkSaleDiscounts1786650600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bulk_sale_discounts" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "discountPercent" numeric(5,2) NOT NULL,
        "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "categoryIds" text,
        "productIds" text,
        "variantIds" text,
        "applyToAllVariants" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bulk_sale_discounts_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bulk_sale_discounts"`);
  }
}
