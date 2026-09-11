import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeoPageFocusKeyphrase1788401100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_pages" ADD COLUMN IF NOT EXISTS "focusKeyphrase" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_pages" DROP COLUMN IF EXISTS "focusKeyphrase"`);
  }
}
