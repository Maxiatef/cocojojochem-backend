import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Admin Analytics')
@ApiBearerAuth('access-token')
@Controller('admin/analytics')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('sales-products')
  @RequirePermission('canViewAnalytics')
  getSalesAndProducts(@Query('days') days?: string) {
    return this.analyticsService.getSalesAndProducts(days ? Number(days) : 30);
  }

  @Get('visitors')
  getVisitors(@Query('days') days?: string) {
    return this.analyticsService.getVisitors(days ? Number(days) : 30);
  }
}
