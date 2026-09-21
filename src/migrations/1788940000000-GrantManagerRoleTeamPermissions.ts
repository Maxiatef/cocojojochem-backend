import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Grant the two own-team permissions to a role already named "Manager".
 *
 * SeedManagerRole1788930000000 inserts that role on a fresh database, but it
 * is ON CONFLICT DO NOTHING — deliberately, so it cannot rewrite a role an
 * installation built by hand. On this installation the role already existed
 * with canViewOwnTeam and canManageOwnTeam set to false, so the seed was a
 * no-op and a role called "Manager" still could not manage a team. Nobody but
 * Admin appeared in the team-manager picker.
 *
 * This merges in exactly those two keys with `||`, leaving every other
 * permission on the role untouched. It is not a general "make Manager
 * powerful" migration.
 */
export class GrantManagerRoleTeamPermissions1788940000000 implements MigrationInterface {
  name = 'GrantManagerRoleTeamPermissions1788940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = COALESCE("permissions", '{}'::jsonb)
        || '{"canViewOwnTeam": true, "canManageOwnTeam": true}'::jsonb
      WHERE "name" = 'Manager'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Back to false rather than removing the keys: absent keys are refilled by
    // RolesService.onApplicationBootstrap, and a permission the catalog knows
    // about should be present and explicit either way.
    await queryRunner.query(`
      UPDATE "roles"
      SET "permissions" = COALESCE("permissions", '{}'::jsonb)
        || '{"canViewOwnTeam": false, "canManageOwnTeam": false}'::jsonb
      WHERE "name" = 'Manager'
    `);
  }
}
