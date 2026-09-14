import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * Read-only by construction: there is no POST, PATCH, PUT or DELETE handler
 * here, and a database trigger rejects UPDATE/DELETE on the table regardless.
 *
 * ADMIN only, not SALES — SALES actions are recorded in this log, so a SALES
 * account must not be able to read (or audit-check) its own trail.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission('canViewAuditLog')
  findAll(@Query() query: QueryAuditLogsDto) {
    return this.auditLogService.findAll(query);
  }

  /** Distinct entity names and actors, for the page's filter dropdowns. */
  @Get('filters')
  @RequirePermission('canViewAuditLog')
  filters() {
    return this.auditLogService.filterOptions();
  }

  // Declared after 'filters' so that literal segment is matched first.
  @Get(':id')
  @RequirePermission('canViewAuditLog')
  findOne(@Param('id') id: string) {
    return this.auditLogService.findOne(id);
  }
}
