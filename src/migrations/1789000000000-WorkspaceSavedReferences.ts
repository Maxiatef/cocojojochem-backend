import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved supplier references (the storefront wishlist entries for reference
 * materials, which have no catalog product id) follow the account too.
 */
export class WorkspaceSavedReferences1789000000000 implements MigrationInterface {
  name = 'WorkspaceSavedReferences1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_workspaces" ADD COLUMN IF NOT EXISTS "savedReferences" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "customer_workspaces" DROP COLUMN IF EXISTS "savedReferences"`);
  }
}
