import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditActorType,
  AuditChildChange,
  AuditFieldChange,
  AuditLog,
  UserRole,
} from '../../entities';
import { AuditStore, BufferedChange } from '../../common/audit/audit.types';
import {
  CHILD_NOUN,
  CHILD_OF,
  pickLabel,
  ROUTE_ENTITY,
  SKIP_ENTITIES,
} from '../../common/audit/audit-config';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('Audit');

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------------ write

  /**
   * Turns one request's buffered entity events into audit rows.
   *
   * Normally exactly one row: the admin did one thing. A request that touches
   * genuinely unrelated top-level records emits one row each, sharing a
   * requestId so they can be recognised as a single action.
   */
  async writeFromBuffer(store: AuditStore, statusCode: number): Promise<void> {
    const actorType = this.actorTypeOf(store);
    if (!actorType) return; // customer traffic, or an unattributable write

    const durationMs = Date.now() - store.startedAt;

    // Children first, so a parent row can absorb them.
    const childrenByParent = new Map<string, BufferedChange[]>();
    const roots: BufferedChange[] = [];

    for (const change of store.buffer) {
      const parentEntity = CHILD_OF[change.entityName];
      if (parentEntity && change.parentId) {
        const key = `${parentEntity}#${change.parentId}`;
        const list = childrenByParent.get(key) || [];
        list.push(change);
        childrenByParent.set(key, list);
      } else {
        roots.push(change);
      }
    }

    const rows: Partial<AuditLog>[] = [];
    const claimed = new Set<string>();
    const routeEntity = this.routeEntityOf(store.http.route);

    for (const root of roots) {
      const key = `${root.entityName}#${root.entityId}`;
      const children = childrenByParent.get(key) || [];
      claimed.add(key);
      rows.push(this.buildRow(store, actorType, statusCode, durationMs, root, children));
    }

    // Children whose parent was not itself written — the usual case for a
    // product edit that only changed a variant, since the product row is
    // untouched and TypeORM fires no event for it.
    for (const [key, children] of childrenByParent) {
      if (claimed.has(key)) continue;
      const [entityName, entityId] = key.split('#');
      // Only attach to the record the route is actually about, so a stray
      // child event can't invent an entry for something unrelated.
      if (routeEntity && entityName !== routeEntity) continue;

      const childChanges = this.rollUpChildren(children);
      if (childChanges.length === 0) continue;

      // The parent row itself was never written, so no event carried its name.
      // Fetch it, so the entry reads `Updated Product "Citric Acid"` rather
      // than a bare `Updated Product`.
      const entityLabel = await this.lookupLabel(entityName, entityId);

      rows.push({
        ...this.envelope(store, actorType, statusCode, durationMs),
        action: AuditAction.UPDATE,
        entityName,
        entityId,
        entityLabel,
        changes: [],
        childChanges,
        summary: this.summarize(AuditAction.UPDATE, entityName, entityLabel, [], childChanges),
      });
    }

    if (rows.length === 0) return;
    // DeepPartial cannot express a jsonb column holding arbitrary values, so
    // the cast lives at this single boundary rather than loosening the types
    // on the entity itself.
    await this.repo.insert(rows as any);
  }

  /**
   * Records something a database subscriber can never see — a login, a failed
   * login, a logout, a password change.
   *
   * Never throws: an auth event failing to log must not break signing in.
   */
  async record(entry: {
    action: AuditAction;
    actorType: AuditActorType;
    actorId?: number | null;
    actorEmail?: string | null;
    actorRole?: string | null;
    entityName: string;
    entityId: string;
    entityLabel?: string | null;
    summary: string;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    try {
      await this.repo.insert({
        occurredAt: new Date(),
        requestId: randomUUID(),
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        actorRole: entry.actorRole ?? null,
        actorSource: null,
        action: entry.action,
        entityName: entry.entityName,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel ?? null,
        summary: entry.summary,
        changes: [],
        childChanges: null,
        truncated: false,
        httpMethod: null,
        route: null,
        statusCode: null,
        durationMs: null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      } as any);
    } catch (err) {
      this.logger.error(`Audit record failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ------------------------------------------------------------------- read

  async findAll(query: QueryAuditLogsDto) {
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50', 10) || 50));

    const qb = this.repo.createQueryBuilder('a');

    if (query.entityName) qb.andWhere('a.entityName = :entityName', { entityName: query.entityName });
    if (query.entityId) qb.andWhere('a.entityId = :entityId', { entityId: query.entityId });
    if (query.actorId) qb.andWhere('a.actorId = :actorId', { actorId: parseInt(query.actorId, 10) });
    if (query.actorType) qb.andWhere('a.actorType = :actorType', { actorType: query.actorType });
    if (query.action) {
      qb.andWhere('a.action IN (:...actions)', { actions: query.action.split(',').map((s) => s.trim()) });
    }
    if (query.from) qb.andWhere('a.occurredAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.occurredAt <= :to', { to: new Date(query.to) });
    if (query.search) {
      const term = `%${query.search.trim()}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('a.summary ILIKE :term', { term })
            .orWhere('a.entityLabel ILIKE :term', { term })
            .orWhere('a.actorEmail ILIKE :term', { term }),
        ),
      );
    }

    // The id tiebreak matters — rows from one request share a millisecond, and
    // without it pagination can repeat or skip them.
    qb.orderBy('a.occurredAt', 'DESC').addOrderBy('a.id', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Audit entry #${id} not found`);
    return row;
  }

  /**
   * Distinct values for the page's filter dropdowns.
   *
   * Written as raw SQL because the query builder mangles a `DISTINCT ...`
   * expression passed through `select()` — it stops quoting the camelCase
   * column, which Postgres then folds to lowercase and rejects. No user input
   * reaches these statements.
   */
  async filterOptions() {
    // Every record type this log CAN hold, read from the TypeORM metadata —
    // so "Function" is selectable before anyone has touched one, and a new
    // entity appears here the moment it is added to the schema.
    //
    // Excluded: entities that are never audited (SKIP_ENTITIES), many-to-many
    // join tables, and child entities like ProductVariant that are folded into
    // their parent's entry and so never appear as an entityName of their own —
    // offering those would be dead options that always return nothing.
    const auditable = this.dataSource.entityMetadatas
      .filter((m) => !m.isJunction && !SKIP_ENTITIES.has(m.name) && !CHILD_OF[m.name])
      .map((m) => m.name);

    // Plus anything already recorded that isn't in that set — rows written
    // before an entity was renamed, or before junction tables were excluded.
    // Nothing in the log should become unfilterable.
    const recorded = await this.repo.query(
      `SELECT DISTINCT a."entityName" AS "entityName" FROM audit_logs a`,
    );

    const entityNames = [
      ...new Set([...auditable, ...recorded.map((r: { entityName: string }) => r.entityName)]),
    ].sort((a, b) => a.localeCompare(b));

    // Every staff account, not just the ones that happen to have acted —
    // "has this person done anything?" is a question worth being able to ask,
    // and an empty result is a perfectly good answer to it. Customers are
    // excluded because their activity is out of scope for this log entirely.
    const staff = await this.repo.query(
      `SELECT u.id, u.email, u.role::text AS role, u.status::text AS status
         FROM users u
        WHERE u.role <> 'CUSTOMER'
        ORDER BY u.email ASC`,
    );

    // Plus anyone already in the log who isn't in that list any more: an
    // account since demoted to CUSTOMER, or hard-deleted. Their entries are
    // still here, so they must stay filterable — otherwise a departed admin's
    // trail becomes unreachable, which is the opposite of the point.
    const pastActors = await this.repo.query(
      `SELECT DISTINCT a."actorId" AS id, a."actorEmail" AS email, a."actorRole" AS role
         FROM audit_logs a
        WHERE a."actorId" IS NOT NULL`,
    );

    const byId = new Map<number, { id: number; email: string; role: string; status?: string }>();
    for (const row of staff) byId.set(row.id, row);
    for (const row of pastActors) {
      if (!byId.has(row.id)) byId.set(row.id, { ...row, status: 'GONE' });
    }
    const actors = [...byId.values()].sort((a, b) => (a.email || '').localeCompare(b.email || ''));

    // The FULL enum, not just the values that happen to be present. These are
    // fixed vocabularies, and an action missing from the list reads as "this
    // system cannot record deletions" rather than "nothing has been deleted
    // yet" — a filter that returns nothing is a useful answer.
    //
    // Still read from the database rather than hardcoded in the UI, so adding
    // an action to the enum surfaces it without a frontend change.
    // enum_range preserves declaration order, which is the logical grouping
    // (CREATE/UPDATE/DELETE, then the auth events) rather than alphabetical.
    const roles = await this.repo.query(
      `SELECT unnest(enum_range(NULL::audit_logs_actortype_enum))::text AS "actorType"`,
    );
    const actions = await this.repo.query(
      `SELECT unnest(enum_range(NULL::audit_logs_action_enum))::text AS "action"`,
    );

    return {
      entityNames,
      actors,
      roles: roles.map((r: { actorType: string }) => r.actorType),
      actions: actions.map((r: { action: string }) => r.action),
    };
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Scope gate. Customers are out of scope entirely, so their cart and
   * checkout writes are dropped here rather than filling the table.
   */
  private actorTypeOf(store: AuditStore): AuditActorType | null {
    if (store.actor) {
      if (store.actor.role === UserRole.ADMIN) return AuditActorType.ADMIN;
      if (store.actor.role === UserRole.SALES) return AuditActorType.SALES;
      return null;
    }
    return store.actorSource ? AuditActorType.SYSTEM : null;
  }

  /**
   * Best-effort display name for a record the buffer only saw indirectly.
   * Never throws — a missing label is cosmetic, and must not cost the entry.
   */
  private async lookupLabel(entityName: string, entityId: string): Promise<string | null> {
    try {
      const row = await this.repo.manager.getRepository<any>(entityName).findOne({
        where: { id: /^\d+$/.test(entityId) ? Number(entityId) : entityId },
      });
      return row ? pickLabel(entityName, row) : null;
    } catch {
      return null;
    }
  }

  private routeEntityOf(route: string): string | null {
    const segments = route.split('/').filter((s) => s && s !== 'api' && s !== 'wholesale' && s !== 'admin');
    for (const segment of segments) {
      const entity = ROUTE_ENTITY[segment];
      if (entity) return entity;
    }
    return null;
  }

  private envelope(
    store: AuditStore,
    actorType: AuditActorType,
    statusCode: number,
    durationMs: number,
  ): Partial<AuditLog> {
    return {
      occurredAt: store.occurredAt,
      requestId: store.requestId,
      actorType,
      actorId: store.actor?.id ?? null,
      actorEmail: store.actor?.email ?? null,
      actorRole: store.actor?.role ?? null,
      actorSource: store.actorSource,
      truncated: store.truncated,
      httpMethod: store.http.method,
      route: store.http.route,
      statusCode,
      durationMs,
      ip: store.http.ip,
      userAgent: store.http.userAgent,
    };
  }

  private buildRow(
    store: AuditStore,
    actorType: AuditActorType,
    statusCode: number,
    durationMs: number,
    root: BufferedChange,
    children: BufferedChange[],
  ): Partial<AuditLog> {
    const changes: AuditFieldChange[] =
      root.action === AuditAction.UPDATE
        ? root.changes || []
        : Object.entries(root.values || {}).map(([field, value]) =>
            root.action === AuditAction.CREATE
              ? { field, before: null, after: value }
              : { field, before: value, after: null },
          );

    const childChanges = this.rollUpChildren(children);

    return {
      ...this.envelope(store, actorType, statusCode, durationMs),
      action: root.action,
      entityName: root.entityName,
      entityId: root.entityId,
      entityLabel: root.entityLabel,
      changes,
      childChanges: childChanges.length > 0 ? childChanges : null,
      summary: this.summarize(root.action, root.entityName, root.entityLabel, changes, childChanges),
    };
  }

  private rollUpChildren(children: BufferedChange[]): AuditChildChange[] {
    const byEntity = new Map<string, AuditChildChange>();

    for (const child of children) {
      const entry =
        byEntity.get(child.entityName) ||
        ({ entity: child.entityName, added: [], removed: [], modified: [] } as AuditChildChange);
      byEntity.set(child.entityName, entry);

      if (child.action === AuditAction.CREATE) {
        entry.added.push({ id: child.entityId, label: child.entityLabel, values: child.values || {} });
      } else if (child.action === AuditAction.DELETE) {
        entry.removed.push({ id: child.entityId, label: child.entityLabel, values: child.values || {} });
      } else if (child.changes?.length) {
        entry.modified.push({ id: child.entityId, label: child.entityLabel, changes: child.changes });
      }
    }

    // A child type with nothing to report is dropped entirely — this is what
    // keeps an unrelated product edit from listing empty variant sections.
    return [...byEntity.values()].filter(
      (e) => e.added.length + e.removed.length + e.modified.length > 0,
    );
  }

  private summarize(
    action: AuditAction,
    entityName: string,
    label: string | null,
    changes: AuditFieldChange[],
    childChanges: AuditChildChange[],
  ): string {
    const verb = { CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted' }[action as string] || action;
    const subject = label ? `${entityName} "${label}"` : entityName;

    const parts: string[] = [];
    if (action === AuditAction.UPDATE && changes.length > 0) {
      parts.push(`${changes.length} field${changes.length === 1 ? '' : 's'} changed`);
    }
    for (const child of childChanges) {
      const noun = CHILD_NOUN[child.entity] || this.humanize(child.entity);
      // Removals first: losing a variant matters more than gaining one, and
      // it's what someone scanning the log is usually hunting for.
      const removed = this.describeChildGroup('removed', child.removed, noun);
      const added = this.describeChildGroup('added', child.added, noun);
      const modified = this.describeChildGroup('changed', child.modified, noun);
      for (const part of [removed, added, modified]) {
        if (part) parts.push(part);
      }
    }

    const summary = parts.length > 0 ? `${verb} ${subject} — ${parts.join(', ')}` : `${verb} ${subject}`;
    return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
  }

  /**
   * Names what was actually added or removed, rather than only counting it —
   * `removed variant "5 Gallon"` answers the question that
   * `1 variant removed` only raises.
   *
   * Falls back to a count past two names, so a bulk edit can't produce a
   * 500-character summary.
   */
  private describeChildGroup(
    verb: string,
    rows: { label: string | null }[],
    noun: string,
  ): string | null {
    if (rows.length === 0) return null;

    const names = rows.map((r) => r.label).filter((l): l is string => !!l && l.trim().length > 0);
    if (names.length === rows.length && names.length <= 2) {
      const quoted = names.map((n) => `"${n}"`).join(' and ');
      return `${verb} ${noun}${names.length === 1 ? '' : 's'} ${quoted}`;
    }

    return `${verb} ${this.count(rows.length, noun)}`;
  }

  private count(n: number, noun: string): string {
    return `${n} ${noun}${n === 1 ? '' : 's'}`;
  }

  private humanize(entityName: string): string {
    return entityName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
}
