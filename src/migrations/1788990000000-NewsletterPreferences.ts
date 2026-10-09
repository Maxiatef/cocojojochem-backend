import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Newsletter signups with chosen topics and a private preferences link.
 *
 * - interests: jsonb array of topic ids (ingredients, formulation, wholesale,
 *   packaging). Existing rows get all topics — they signed up for everything.
 * - status: pending | subscribed | unsubscribed. Existing rows (from the old
 *   email-only form) become subscribed.
 * - consentVersion / consentedAt: the consent wording agreed to, and when.
 * - tokenHash: sha256 of the private preferences token (the token itself is
 *   never stored). Unique so a token resolves to exactly one signup.
 * - updatedAt: last change.
 */
export class NewsletterPreferences1788990000000 implements MigrationInterface {
  name = 'NewsletterPreferences1788990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "interests" jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'pending'`);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "consentVersion" varchar(64)`);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "consentedAt" timestamptz`);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "tokenHash" varchar(64)`);
    await q(`ALTER TABLE "newsletter_subscribers" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz DEFAULT now()`);
    await q(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_newsletter_subscribers_tokenHash" ON "newsletter_subscribers" ("tokenHash")`);
    await q(`
      UPDATE "newsletter_subscribers"
      SET "status" = 'subscribed',
          "interests" = '["ingredients","formulation","wholesale","packaging"]'::jsonb,
          "consentedAt" = COALESCE("consentedAt", "createdAt"),
          "updatedAt" = COALESCE("updatedAt", "createdAt")
      WHERE "interests" = '[]'::jsonb AND "tokenHash" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);
    await q(`DROP INDEX IF EXISTS "UQ_newsletter_subscribers_tokenHash"`);
    for (const col of ['updatedAt', 'tokenHash', 'consentedAt', 'consentVersion', 'status', 'interests']) {
      await q(`ALTER TABLE "newsletter_subscribers" DROP COLUMN IF EXISTS "${col}"`);
    }
  }
}
