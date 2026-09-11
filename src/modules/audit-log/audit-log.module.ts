import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../entities';
import { AuditLogService } from './audit-log.service';
import { AuditLogController } from './audit-log.controller';
import { AuditContextService } from '../../common/audit/audit-context.service';
import { AuditSubscriber } from '../../common/audit/audit.subscriber';

/**
 * Global so the handful of services that record non-CRUD events (logins,
 * password changes) can inject AuditLogService without every module importing
 * this one — and so the globally-registered AuditInterceptor can resolve it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditContextService, AuditSubscriber],
  exports: [AuditLogService, AuditContextService],
})
export class AuditLogModule {}
