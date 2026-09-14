import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateUserToUseForeignKey1788500100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "roleId" INT`);

    await queryRunner.query(`
      UPDATE "users"
      SET "roleId" = CASE
        WHEN "role" = 'ADMIN' THEN 1
        WHEN "role" = 'SALES' THEN 2
        ELSE NULL
      END
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_roleId"
      FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`CREATE INDEX "IDX_users_roleId" ON "users" ("roleId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_roleId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_roleId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleId"`);
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "role" VARCHAR NOT NULL DEFAULT 'CUSTOMER'
    `);
  }
}
