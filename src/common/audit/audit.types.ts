import { AuditAction } from '../../entities';

/** One raw entity event, buffered by the subscriber until the request ends. */
export interface BufferedChange {
  action: AuditAction.CREATE | AuditAction.UPDATE | AuditAction.DELETE;
  entityName: string;
  entityId: string;
  entityLabel: string | null;
  /** Full column snapshot — present for CREATE and DELETE, absent for UPDATE. */
  values?: Record<string, unknown>;
  /** Per-field diff — present for UPDATE only. */
  changes?: { field: string; before: unknown; after: unknown }[];
  /** The owning record's id when this entity is a child (e.g. a variant's productId). */
  parentId?: string | null;
}

export interface AuditActor {
  id: number;
  email: string;
  role: string;
}

/**
 * Per-request state, carried through AsyncLocalStorage so the TypeORM
 * subscriber — which has no access to the HTTP request — can still attribute
 * a database change to the person who caused it.
 */
export interface AuditStore {
  requestId: string;
  startedAt: number;
  occurredAt: Date;
  actor: AuditActor | null;
  actorSource: string | null;
  http: {
    method: string;
    route: string;
    ip: string | null;
    userAgent: string | null;
  };
  buffer: BufferedChange[];
  /** Set once the cap is hit, so the written row admits it is partial. */
  truncated: boolean;
  enabled: boolean;
}
