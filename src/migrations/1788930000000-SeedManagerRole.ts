import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A system "Manager" role.
 *
 * Teams shipped with the two permissions a manager needs — canViewOwnTeam and
 * canManageOwnTeam — but no role that actually held them. The only account
 * offered in the team-manager picker was Admin, which gets every permission
 * from the bootstrap sync rather than from any deliberate grant. Making
 * someone a manager meant hand-building a role first.
 *
 * The permission set is Sales' read access plus the two own-team keys: a
 * manager runs a desk, so they see what their people see, and they see their
 * team's activity and roster on top of it. Notably absent are canViewTeams and
 * canManageTeams — those are the admin side of the feature, and a manager who
 * held them could read every other team as well.
 *
 * Only `true` keys are listed. RolesService.onApplicationBootstrap fills in
 * every remaining catalog key as false on the next boot.
 */
export class SeedManagerRole1788930000000 implements MigrationInterface {
  name = 'SeedManagerRole1788930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ON CONFLICT rather than a plain INSERT: an installation that already
    // hand-made a role called "Manager" keeps its own permissions instead of
    // having them silently rewritten by a migration.
    await queryRunner.query(`
      INSERT INTO "roles" ("name", "description", "isSystem", "permissions") VALUES (
        'Manager',
        'Runs one team — sees their members'' activity and manages the roster',
        true,
        '{
          "canViewOwnTeam": true,
          "canManageOwnTeam": true,
          "canViewProducts": true,
          "canViewCategories": true,
          "canViewOrders": true,
          "canViewCoupons": true,
          "canViewBulkSales": true,
          "canViewCompanies": true,
          "canViewQuoteRequests": true,
          "canViewContactMessages": true,
          "canViewFunctions": true,
          "canViewShippingRates": true,
          "canViewDashboard": true,
          "canViewAnalytics": true,
          "canEditOrderStatus": true,
          "canEditOrderTracking": true,
          "canEditQuoteRequest": true,
          "canEditContactMessage": true
        }'::jsonb
      )
      ON CONFLICT ("name") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only if nobody holds it — dropping a role out from under live accounts
    // would leave them with no permissions at all. The FK is ON DELETE SET
    // NULL, so it would fail silently rather than loudly.
    await queryRunner.query(`
      DELETE FROM "roles"
      WHERE "name" = 'Manager'
        AND "isSystem" = true
        AND NOT EXISTS (SELECT 1 FROM "users" WHERE "users"."roleId" = "roles"."id")
    `);
  }
}
