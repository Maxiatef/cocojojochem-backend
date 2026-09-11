import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityMetadata,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  UpdateEvent,
} from 'typeorm';
import { AuditContextService } from './audit-context.service';
import {
  CHILD_PARENT_KEY,
  IGNORED_DIFF_FIELDS,
  isSensitiveField,
  pickLabel,
  REDACTED,
  SKIP_ENTITIES,
} from './audit-config';
import { AuditAction } from '../../entities';

/**
 * Watches every entity write and buffers what changed into the current
 * request's audit context. It writes nothing itself — the roll-up and the
 * INSERT happen once per request in AuditLogService.
 *
 * Listening at the persistence layer (rather than reading request bodies in an
 * interceptor) means the log records what actually changed in the database
 * instead of what was submitted, gives genuine before-values, and cannot be
 * forgotten when someone adds the next write endpoint.
 */
@Injectable()
@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly ctx: AuditContextService,
  ) {
    // Self-registering, because the `subscribers:` option in the TypeORM
    // config instantiates the class itself and so cannot inject the context
    // service. This also avoids a third place to keep the entity list in sync.
    dataSource.subscribers.push(this);
  }

  // No listenTo(), so this sees every entity; SKIP_ENTITIES does the filtering.

  afterInsert(event: InsertEvent<any>): void {
    if (!this.active(event.metadata)) return;

    const values = this.snapshot(event.entity, event.metadata);
    this.ctx.push({
      action: AuditAction.CREATE,
      entityName: event.metadata.name,
      entityId: this.idOf(event.entity, event.metadata),
      entityLabel: pickLabel(event.metadata.name, values),
      values,
      parentId: this.parentIdOf(event.entity, event.metadata),
    });
  }

  afterUpdate(event: UpdateEvent<any>): void {
    if (!this.active(event.metadata)) return;

    // Both are undefined when the write came from `repository.update()` or a
    // query builder — TypeORM never loaded a row, so there is nothing to diff
    // against. Recording a half-known change would be worse than recording
    // none; see the note in audit-config.ts.
    if (!event.entity || !event.databaseEntity) return;

    const changes = this.diff(event.databaseEntity, event.entity, event.metadata);
    if (changes.length === 0) return;

    this.ctx.push({
      action: AuditAction.UPDATE,
      entityName: event.metadata.name,
      entityId: this.idOf(event.databaseEntity, event.metadata),
      entityLabel: pickLabel(
        event.metadata.name,
        this.snapshot(event.databaseEntity, event.metadata),
      ),
      changes,
      parentId: this.parentIdOf(event.databaseEntity, event.metadata),
    });
  }

  afterRemove(event: RemoveEvent<any>): void {
    if (!this.active(event.metadata)) return;

    // databaseEntity is the row as it was loaded, which is the whole value of
    // using remove() over delete() — the latter fires nothing at all.
    const source = event.databaseEntity ?? event.entity;
    if (!source) return;

    const values = this.snapshot(source, event.metadata);
    this.ctx.push({
      action: AuditAction.DELETE,
      entityName: event.metadata.name,
      entityId: event.entityId != null ? String(event.entityId) : this.idOf(source, event.metadata),
      entityLabel: pickLabel(event.metadata.name, values),
      values,
      parentId: this.parentIdOf(source, event.metadata),
    });
  }

  // ---------------------------------------------------------------- helpers

  /** One property read for anything outside a request — bootstrap, seeds, cron. */
  private active(metadata: EntityMetadata): boolean {
    const store = this.ctx.get();
    if (!store?.enabled) return false;

    // Many-to-many join tables (product_certifications, product_functions)
    // fire events like any other insert, but they have no entity class, no
    // primary key to report and no human label — they were surfacing as
    // "Created product_certifications #unknown", which tells a reader nothing.
    // The certification change itself is still visible on the product's own
    // entry; see the many-to-many note at the top of audit-config.ts.
    if (metadata.isJunction) return false;

    return !SKIP_ENTITIES.has(metadata.name);
  }

  private idOf(entity: any, metadata: EntityMetadata): string {
    const values = metadata.primaryColumns.map((c) => entity?.[c.propertyName]).filter((v) => v != null);
    return values.length > 0 ? values.join(':') : 'unknown';
  }

  private parentIdOf(entity: any, metadata: EntityMetadata): string | null {
    const key = CHILD_PARENT_KEY[metadata.name];
    if (!key) return null;
    const value = entity?.[key];
    return value != null ? String(value) : null;
  }

  /**
   * Column values for one row, with secrets replaced before they enter the
   * buffer — so a password hash never exists anywhere in the audit path at
   * all, rather than being stripped somewhere downstream.
   */
  private snapshot(entity: any, metadata: EntityMetadata): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const column of metadata.columns) {
      const field = column.propertyName;
      if (!(field in (entity || {}))) continue;
      out[field] = isSensitiveField(field) ? REDACTED : this.plain(entity[field]);
    }
    return out;
  }

  private diff(
    before: any,
    after: any,
    metadata: EntityMetadata,
  ): { field: string; before: unknown; after: unknown }[] {
    const changes: { field: string; before: unknown; after: unknown }[] = [];

    for (const column of metadata.columns) {
      const field = column.propertyName;
      // updatedAt and friends are bumped by the ORM on every save; see
      // IGNORED_DIFF_FIELDS.
      if (IGNORED_DIFF_FIELDS.has(field)) continue;
      // An UPDATE only carries the properties that were assigned. A field
      // absent from `after` was not part of this write, so it did not change.
      if (!(field in (after || {}))) continue;

      const a = before?.[field];
      const b = after?.[field];
      if (this.equal(a, b)) continue;

      changes.push(
        isSensitiveField(field)
          ? { field, before: REDACTED, after: REDACTED }
          : { field, before: this.plain(a), after: this.plain(b) },
      );
    }

    return changes;
  }

  /**
   * Value comparison, rather than trusting event.updatedColumns: that list is
   * empty for `.update()` writes, and the `preload()` pattern used across this
   * codebase constantly re-assigns fields to the value they already held,
   * which would otherwise show up as a change on every save.
   */
  private equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    // null and undefined both mean "no value" here; an omitted DTO field and a
    // NULL column should not read as a change.
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    if (a instanceof Date || b instanceof Date) {
      const ta = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
      const tb = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
      return ta === tb;
    }

    // `numeric`/`decimal` columns come back from pg as STRINGS while a DTO
    // supplies numbers — price, salePrice, weightLb, every order total. Without
    // this, "24.00" vs 24 reads as a change on every single save.
    if (
      (typeof a === 'number' || typeof a === 'string') &&
      (typeof b === 'number' || typeof b === 'string')
    ) {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
        return na === nb;
      }
    }

    if (typeof a === 'object' && typeof b === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }

    return false;
  }

  /** Dates to ISO, everything else through as-is, for stable JSONB storage. */
  private plain(value: unknown): unknown {
    if (value instanceof Date) return value.toISOString();
    if (value === undefined) return null;
    return value;
  }
}
