import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Append-only audit log of every admin/staff change.
 *
 * Two things here are deliberate and worth not "tidying up" later:
 *
 * 1. There are NO foreign keys — not on actorId, and not on entityId. A FK to
 *    users or products would force ON DELETE CASCADE (erasing the record of a
 *    deletion at the moment the deletion happens) or RESTRICT (making the
 *    referenced row undeletable). Both defeat the purpose. entityName +
 *    entityId is a polymorphic link that outlives what it points at.
 *
 * 2. A trigger blocks UPDATE and DELETE on the table. The absence of a route
 *    is a policy; the trigger is an actual guarantee, and it also stops a
 *    stray psql session or a future ORM mistake from rewriting history.
 *    INSERT is untouched, so migrationsRun and normal writes are unaffected.
 */
export class CreateAuditLogs1788400300000 implements MigrationInterface {
  name = 'CreateAuditLogs1788400300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGE', 'SESSION_REVOKE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_actortype_enum" AS ENUM('ADMIN', 'SALES', 'SYSTEM')`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"           BIGSERIAL PRIMARY KEY,
        "occurredAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "requestId"    UUID NOT NULL,
        "actorType"    "public"."audit_logs_actortype_enum" NOT NULL,
        "actorId"      INTEGER,
        "actorEmail"   VARCHAR(255),
        "actorRole"    VARCHAR(32),
        "actorSource"  VARCHAR(32),
        "action"       "public"."audit_logs_action_enum" NOT NULL,
        "entityName"   VARCHAR(64)  NOT NULL,
        "entityId"     VARCHAR(64)  NOT NULL,
        "entityLabel"  VARCHAR(255),
        "summary"      VARCHAR(500) NOT NULL,
        "changes"      JSONB NOT NULL DEFAULT '[]'::jsonb,
        "childChanges" JSONB,
        "truncated"    BOOLEAN NOT NULL DEFAULT false,
        "httpMethod"   VARCHAR(10),
        "route"        VARCHAR(255),
        "statusCode"   INTEGER,
        "durationMs"   INTEGER,
        "ip"           VARCHAR(64),
        "userAgent"    VARCHAR(512)
      )
    `);

    // The default list view is "newest first", hence DESC on every timestamp.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_occurredAt" ON "audit_logs" ("occurredAt" DESC)`,
    );
    // Serves the reverse direction of the polymorphic link: the full history
    // of one record, as shown on the product/order/user detail screens.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entityName", "entityId", "occurredAt" DESC)`,
    );
    // Partial: SYSTEM rows have no actorId and are the bulk of the table over
    // time, so there is no reason to index their NULLs.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor" ON "audit_logs" ("actorId", "occurredAt" DESC) WHERE "actorId" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action", "occurredAt" DESC)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_requestId" ON "audit_logs" ("requestId")`);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only (attempted %)', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER audit_logs_no_update_delete
        BEFORE UPDATE OR DELETE ON "audit_logs"
        FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON "audit_logs"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS audit_logs_immutable()`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_requestId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_audit_logs_occurredAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."audit_logs_actortype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."audit_logs_action_enum"`);
  }
}
