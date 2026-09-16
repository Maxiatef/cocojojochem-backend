import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staff teams: a named group of users with one manager.
 *
 * Both foreign keys are ON DELETE SET NULL. A team losing its manager, or a
 * user losing their team, must never cascade into deleting people — the whole
 * point of the table is to describe a reporting line, and a reporting line
 * going away is not a reason to remove the person it described.
 */
export class CreateTeams1788600000000 implements MigrationInterface {
  name = 'CreateTeams1788600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id" SERIAL NOT NULL,
        "name" character varying NOT NULL,
        "description" text,
        "managerId" integer,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_teams" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_teams_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "teams"
        ADD CONSTRAINT "FK_teams_manager"
        FOREIGN KEY ("managerId") REFERENCES "users"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`ALTER TABLE "users" ADD "teamId" integer`);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_team"
        FOREIGN KEY ("teamId") REFERENCES "teams"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Every scoped read starts "which users are in this team" or "which team
    // does this person manage", so both directions get an index.
    await queryRunner.query(`CREATE INDEX "IDX_users_teamId" ON "users" ("teamId")`);
    await queryRunner.query(`CREATE INDEX "IDX_teams_managerId" ON "teams" ("managerId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_teams_managerId"`);
    await queryRunner.query(`DROP INDEX "IDX_users_teamId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_team"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "teamId"`);
    await queryRunner.query(`ALTER TABLE "teams" DROP CONSTRAINT "FK_teams_manager"`);
    await queryRunner.query(`DROP TABLE "teams"`);
  }
}
