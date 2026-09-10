import { MigrationInterface, QueryRunner } from 'typeorm';

// Soft-delete support for users: an ACTIVE/DELETED status plus the timestamp
// the Recycle Bin displays. See UserStatus in src/entities/User.ts for why
// this is an explicit enum rather than TypeORM's @DeleteDateColumn.
export class AddUserStatus1788400200000 implements MigrationInterface {
  name = 'AddUserStatus1788400200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'DELETED')`);

    // NOT NULL + DEFAULT backfills every existing row in this one statement,
    // so no separate UPDATE pass is needed.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE'`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP`);

    // Partial index: the Recycle Bin is the only query that filters on this
    // and it selects a tiny minority of rows. Indexing the ACTIVE side too
    // would never be used — it matches almost everything.
    await queryRunner.query(
      `CREATE INDEX "IDX_users_status_deleted" ON "users" ("status") WHERE "status" = 'DELETED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_status_deleted"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
  }
}
