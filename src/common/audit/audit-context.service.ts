import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditStore, BufferedChange } from './audit.types';
import { MAX_BUFFERED_CHANGES } from './audit-config';

/**
 * Carries the current request's identity down into the persistence layer.
 *
 * A TypeORM subscriber sees entity changes but has no idea which HTTP request
 * caused them; AsyncLocalStorage bridges the two without threading a parameter
 * through every service method.
 *
 * Hand-rolled on node:async_hooks rather than pulling in nestjs-cls — that
 * package would be a new dependency for what amounts to the thirty lines
 * below, and there is no existing CLS usage in this project to be consistent
 * with.
 *
 * This MUST stay a singleton. ALS already isolates per request, and making the
 * provider request-scoped would force everything that injects it request-scoped
 * too — including the subscriber, which is constructed once at startup and
 * could then never be given one.
 */
@Injectable()
export class AuditContextService {
  private readonly als = new AsyncLocalStorage<AuditStore>();

  run<T>(store: AuditStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  get(): AuditStore | undefined {
    return this.als.getStore();
  }

  /**
   * Buffers one change. Outside a request there is no store and this is a
   * no-op, which is what keeps seed scripts, migrations and the boot sequence
   * out of the log for free.
   */
  push(change: BufferedChange): void {
    const store = this.als.getStore();
    if (!store) return;

    if (store.buffer.length >= MAX_BUFFERED_CHANGES) {
      // Mark rather than throw: losing the tail of a huge bulk operation is
      // acceptable, silently pretending the row is complete is not.
      store.truncated = true;
      return;
    }
    store.buffer.push(change);
  }
}
