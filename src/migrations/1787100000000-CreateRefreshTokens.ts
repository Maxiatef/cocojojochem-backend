import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs the access+refresh token auth flow: short-lived (15m) access JWTs
// stay purely local/stateless to verify, while refresh tokens (30d) are
// tracked here so they can be rotated and revoked. Only the SHA-256 hash of
// the raw token is stored; the UNIQUE index on "tokenHash" is what keeps the
// refresh lookup fast (single indexed equality lookup, no bcrypt).
export class CreateRefreshTokens1787100000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "revokedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_tokenHash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
