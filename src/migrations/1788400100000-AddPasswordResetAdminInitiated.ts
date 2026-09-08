import { MigrationInterface, QueryRunner } from 'typeorm';

// Marks a password-reset request as admin-issued ("Send Reset Link" on the
// admin user editor) rather than customer-issued. Admin rows are minted
// pre-verified and live for 24h instead of the ~25 minute code-flow window,
// so AuthService.resetPassword needs to be able to tell them apart.
export class AddPasswordResetAdminInitiated1788400100000 implements MigrationInterface {
  name = 'AddPasswordResetAdminInitiated1788400100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "password_reset_requests" ADD COLUMN "adminInitiated" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "password_reset_requests" DROP COLUMN "adminInitiated"`);
  }
}
