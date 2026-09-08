import { MigrationInterface, QueryRunner } from 'typeorm';

// Splits the existing single `fullName` into editable first/last parts for
// the admin user editor. `fullName` is left in place and stays canonical —
// it's recomposed from these two whenever they're edited (see
// UsersService.updateUser), so nothing that already reads `fullName`
// changes behaviour.
export class AddUserFirstLastName1788400000000 implements MigrationInterface {
  name = 'AddUserFirstLastName1788400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "firstName" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "lastName" character varying`);

    // Backfill from whatever is already in fullName so existing accounts
    // don't open in the editor with two blank name fields. Split on the
    // FIRST space only: "Mary Anne Smith" -> "Mary" + "Anne Smith", which is
    // the least-surprising reading for a surname that contains a space.
    // A single-word name backfills firstName and leaves lastName NULL.
    await queryRunner.query(`
      UPDATE "users"
      SET
        "firstName" = NULLIF(split_part(trim("fullName"), ' ', 1), ''),
        "lastName" = NULLIF(
          trim(substring(trim("fullName") from position(' ' in trim("fullName")) + 1)),
          ''
        )
      WHERE "fullName" IS NOT NULL AND trim("fullName") <> ''
    `);

    // position() returns 0 when there's no space at all, which would make
    // the substring above copy the whole name into lastName as well.
    await queryRunner.query(`
      UPDATE "users"
      SET "lastName" = NULL
      WHERE position(' ' in trim("fullName")) = 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
  }
}
