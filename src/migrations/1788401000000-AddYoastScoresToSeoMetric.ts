import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYoastScoresToSeoMetric1788401000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "readabilityScore" integer`);
    await queryRunner.query(
      `ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "seoProblems" integer DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "readabilityProblems" integer DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "yoastChecks" jsonb`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "yoastSeoScore" integer`);
    await queryRunner.query(
      `ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "skippedChecks" integer DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "skippedChecks"`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "yoastSeoScore"`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "yoastChecks"`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "readabilityProblems"`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "seoProblems"`);
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "readabilityScore"`);
  }
}
