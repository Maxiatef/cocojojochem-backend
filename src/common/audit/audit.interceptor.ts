import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { AuditContextService } from './audit-context.service';
import { AuditStore } from './audit.types';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Opens an audit context for every write request, then flushes whatever the
 * subscriber buffered once the handler settles.
 *
 * Registered globally via APP_INTERCEPTOR. Nest runs guards BEFORE
 * interceptors, so JwtAuthGuard has already put { id, email, role } on
 * req.user by the time this runs — no controller changes and no @CurrentUser
 * decorator are needed anywhere.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Audit');

  constructor(
    private readonly ctx: AuditContextService,
    private readonly auditLog: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Reads are never audited. This is also what keeps the storefront's
    // browsing traffic from paying for an ALS context it would never use.
    if (READ_METHODS.has(req.method)) return next.handle();

    const route: string = req.route?.path || req.originalUrl || req.url || '';

    const store: AuditStore = {
      requestId: randomUUID(),
      startedAt: Date.now(),
      occurredAt: new Date(),
      actor: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : null,
      // Webhooks carry no user but do change real data, so they are attributed
      // to their source rather than dropped — otherwise an order would change
      // status with nobody appearing to have touched it.
      actorSource: this.systemSourceFor(route),
      http: {
        method: req.method,
        route,
        ip: this.ipOf(req),
        userAgent: this.truncate(req.headers?.['user-agent'], 512),
      },
      buffer: [],
      truncated: false,
      enabled: true,
    };

    return this.ctx.run(store, () =>
      next.handle().pipe(
        tap({
          next: () => this.flush(store, res?.statusCode ?? 200),
          error: (err) => this.flush(store, err?.status ?? err?.statusCode ?? 500),
        }),
      ),
    );
  }

  /**
   * Deliberately fire-and-forget, and deliberately never awaited.
   *
   * setImmediate takes the write off the request's turn so it cannot join the
   * business transaction (a rollback must never erase the log, and an audit
   * failure must never roll back a real change). The .catch means a broken
   * audit table degrades to a log line instead of a failed admin action.
   */
  private flush(store: AuditStore, statusCode: number): void {
    if (store.buffer.length === 0) return;

    setImmediate(() => {
      this.auditLog
        .writeFromBuffer(store, statusCode)
        .catch((err) =>
          this.logger.error(`Audit write failed: ${err instanceof Error ? err.message : err}`),
        );
    });
  }

  private systemSourceFor(route: string): string | null {
    if (!route.includes('/webhooks/')) return null;
    if (route.includes('stripe')) return 'stripe-webhook';
    if (route.includes('shippo')) return 'shippo-webhook';
    if (route.includes('shipstation')) return 'shipstation-webhook';
    return 'webhook';
  }

  private ipOf(req: any): string | null {
    const forwarded = req.headers?.['x-forwarded-for'];
    const raw =
      (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined) ||
      req.ip ||
      req.socket?.remoteAddress;
    return this.truncate(raw, 64);
  }

  private truncate(value: unknown, max: number): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.length > max ? value.slice(0, max) : value;
  }
}
