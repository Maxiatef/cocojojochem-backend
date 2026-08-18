import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteSettings1786650700000 implements MigrationInterface {
  name = 'CreateSiteSettings1786650700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "site_settings" (
        "id" SERIAL NOT NULL,
        "key" character varying NOT NULL,
        "value" text,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_site_settings_key" UNIQUE ("key"),
        CONSTRAINT "PK_site_settings_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "site_settings"`);
  }
}
