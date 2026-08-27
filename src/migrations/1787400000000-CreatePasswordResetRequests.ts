import { MigrationInterface, QueryRunner } from 'typeorm';

// "Forgot password" flow storage: a hashed 5-digit code (never the raw
// code), an attempts counter to lock out brute-forcing the small code
// space, and a separate high-entropy verifiedTokenHash issued once the code
// is confirmed — that token (not the code) is what the final
// set-new-password step actually consumes.
export class CreatePasswordResetRequests1787400000000 implements MigrationInterface {
  name = 'CreatePasswordResetRequests1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_requests" (
        "id" SERIAL PRIMARY KEY,
        "userId" integer NOT NULL,
        "codeHash" varchar(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "verifiedTokenHash" varchar(64),
        "expiresAt" timestamp NOT NULL,
        "usedAt" timestamp,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_requests_userId" ON "password_reset_requests" ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_password_reset_requests_verifiedTokenHash" ON "password_reset_requests" ("verifiedTokenHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "password_reset_requests"`);
  }
}
