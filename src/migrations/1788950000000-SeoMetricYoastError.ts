import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores why a page's Yoast analysis produced no scores.
 *
 * The score columns are already nullable, so "not analyzed" was expressible —
 * but not *why*, which lived only in a server log. On a serverless host that
 * is the one place an operator will not look when the dashboard simply shows
 * a dash, which is how a completely dead analyzer went unnoticed through
 * several crawls.
 */
export class SeoMetricYoastError1788950000000 implements MigrationInterface {
  name = 'SeoMetricYoastError1788950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_metrics" ADD COLUMN IF NOT EXISTS "yoastError" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "seo_metrics" DROP COLUMN IF EXISTS "yoastError"`);
  }
}
