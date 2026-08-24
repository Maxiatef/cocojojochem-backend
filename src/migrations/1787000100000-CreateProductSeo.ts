import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductSeo1787000100000 implements MigrationInterface {
  name = 'CreateProductSeo1787000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_seo" (
        "id" SERIAL NOT NULL,
        "productId" integer NOT NULL,
        "focusKeyphrase" character varying,
        "seoTitle" character varying,
        "metaDescription" text,
        "socialTitle" character varying,
        "socialDescription" text,
        "socialImageUrl" character varying,
        "tags" text array,
        CONSTRAINT "UQ_product_seo_productId" UNIQUE ("productId"),
        CONSTRAINT "PK_product_seo_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "product_seo"
      ADD CONSTRAINT "FK_product_seo_productId" FOREIGN KEY ("productId")
      REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "product_seo"`);
  }
}
