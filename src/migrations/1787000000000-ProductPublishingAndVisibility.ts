import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductPublishingAndVisibility1787000000000 implements MigrationInterface {
  name = 'ProductPublishingAndVisibility1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "isActive" TO "isPublished"`);

    await queryRunner.query(
      `CREATE TYPE "public"."products_visibility_enum" AS ENUM('PUBLIC','PRIVATE','PASSWORD_PROTECTED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD "visibility" "public"."products_visibility_enum" NOT NULL DEFAULT 'PUBLIC'`,
    );
    await queryRunner.query(`ALTER TABLE "products" ADD "visibilityPassword" character varying`);
    await queryRunner.query(`ALTER TABLE "products" ADD "scheduledPublishAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "products" ADD "brand" character varying`);
    await queryRunner.query(`ALTER TABLE "products" ADD "description" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "brand"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "scheduledPublishAt"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "visibilityPassword"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "visibility"`);
    await queryRunner.query(`DROP TYPE "public"."products_visibility_enum"`);
    await queryRunner.query(`ALTER TABLE "products" RENAME COLUMN "isPublished" TO "isActive"`);
  }
}
