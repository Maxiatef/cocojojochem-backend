import { MigrationInterface, QueryRunner } from 'typeorm';

/** Server copy of a customer's comparison list and formulation projects. */
export class CreateCustomerWorkspaces1788960000000 implements MigrationInterface {
  name = 'CreateCustomerWorkspaces1788960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_workspaces" (
        "userId" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "compare" jsonb NOT NULL DEFAULT '[]',
        "projects" jsonb NOT NULL DEFAULT '[]',
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_workspaces"`);
  }
}
