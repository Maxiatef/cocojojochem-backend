import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  SESSION_REVOKE = 'SESSION_REVOKE',
}

export enum AuditActorType {
  ADMIN = 'ADMIN',
  SALES = 'SALES',
  SYSTEM = 'SYSTEM',
}

export interface AuditFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface AuditChildChange {
  entity: string;
  added: { id: string; label: string | null; values: Record<string, unknown> }[];
  removed: { id: string; label: string | null; values: Record<string, unknown> }[];
  modified: { id: string; label: string | null; changes: AuditFieldChange[] }[];
}

/**
 * An append-only record of every admin/staff change in the system.
 *
 * One row per admin ACTION, not per database row touched — editing a product
 * that also rewrites three variants is a single entry with the product's field
 * diff plus a summary of what happened to the variants. The roll-up lives in
 * AuditLogService.writeFromBuffer.
 *
 * Nothing ever updates or deletes a row here. There is no repository call that
 * does so, no route that exposes one, and a database trigger rejects both
 * operations outright — an audit log an admin can quietly edit proves nothing.
 */
@Entity('audit_logs')
@Index('IDX_audit_logs_occurredAt', ['occurredAt'])
@Index('IDX_audit_logs_entity', ['entityName', 'entityId', 'occurredAt'])
@Index('IDX_audit_logs_action', ['action', 'occurredAt'])
@Index('IDX_audit_logs_requestId', ['requestId'])
export class AuditLog {
  // bigint because this table only ever grows. TypeORM maps it to string in
  // JS to avoid silently losing precision past Number.MAX_SAFE_INTEGER.
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // Set from the moment the request started rather than by @CreateDateColumn,
  // so every row from one request shares an instant and the ordering reflects
  // when the admin acted, not when the flush happened to run.
  @Column({ type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  // Ties together the rare request that legitimately touches two unrelated
  // top-level records.
  @Column({ type: 'uuid' })
  requestId: string;

  @Column({ type: 'enum', enum: AuditActorType })
  actorType: AuditActorType;

  // Deliberately NOT a foreign key to users. A FK would force either
  // ON DELETE CASCADE (which erases a departed admin's entire history, the
  // opposite of the point) or RESTRICT (which makes them undeletable).
  @Column({ type: 'int', nullable: true })
  actorId: number | null;

  // Snapshots, so the log still reads correctly after the account is renamed,
  // demoted or deleted. actorRole is the role AT THE TIME of the action.
  @Column({ type: 'varchar', length: 255, nullable: true })
  actorEmail: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  actorRole: string | null;

  // Names the automated source for SYSTEM rows: 'stripe-webhook',
  // 'shippo-webhook', 'cron'. Null for a human actor.
  @Column({ type: 'varchar', length: 32, nullable: true })
  actorSource: string | null;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  // Polymorphic link to the rest of the schema — see entityId.
  @Column({ type: 'varchar', length: 64 })
  entityName: string;

  // varchar rather than int so non-integer keys fit: ShippingRateTier is keyed
  // by kind/zone/breakpoint and SiteSetting by a string key. Joining is still
  // ordinary SQL:
  //   JOIN products p ON p.id = a."entityId"::int AND a."entityName" = 'Product'
  @Column({ type: 'varchar', length: 64 })
  entityId: string;

  // The record's display name at the time of the action, so a row still reads
  // `Deleted Product "Citric Acid Anhydrous" #12` long after #12 is gone.
  @Column({ type: 'varchar', length: 255, nullable: true })
  entityLabel: string | null;

  @Column({ type: 'varchar', length: 500 })
  summary: string;

  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  changes: AuditFieldChange[];

  @Column({ type: 'jsonb', nullable: true })
  childChanges: AuditChildChange[] | null;

  // True when the buffer hit its cap — the row is a partial record and says so
  // rather than looking complete.
  @Column({ type: 'boolean', default: false })
  truncated: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  httpMethod: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  route: string | null;

  // A 4xx/5xx row may describe a change that was rolled back; the UI flags it.
  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;
}
