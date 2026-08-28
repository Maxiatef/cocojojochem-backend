import { MigrationInterface, QueryRunner } from 'typeorm';

// Lightweight in-house visitor tracking — one row per storefront page load,
// keyed by a client-generated visitorId (localStorage, not tied to a real
// identity) so "unique visitors" can be derived without a third-party
// analytics service.
export class CreatePageViews1787500000000 implements MigrationInterface {
  name = 'CreatePageViews1787500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "page_views" (
        "id" SERIAL PRIMARY KEY,
        "path" varchar NOT NULL,
        "visitorId" varchar NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_page_views_visitorId" ON "page_views" ("visitorId")`);
    await queryRunner.query(`CREATE INDEX "IDX_page_views_createdAt" ON "page_views" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "page_views"`);
  }
}
