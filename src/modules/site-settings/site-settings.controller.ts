import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('Site Settings')
@ApiBearerAuth('access-token')
@Controller('site-settings')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  @RequirePermission('canViewSiteSettings')
  findAll() {
    return this.siteSettingsService.findAll();
  }

  // Read-only status of which third-party integrations have credentials
  // configured — never returns the actual key values. Keys themselves stay
  // in .env, not the DB, so there's nothing here for this endpoint to leak.
  @Get('integrations-status')
  @RequirePermission('canViewSiteSettings')
  getIntegrationsStatus() {
    return {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      resend: !!process.env.RESEND_API_KEY,
      // Shippo is the shipping provider; ShipStation is disabled in code.
      shippo: !!process.env.SHIPPO_API_KEY,
      // shipstation: !!process.env.SHIPSTATION_API_KEY, // disabled
    };
  }

  @Patch()
  @RequirePermission('canEditSiteSettings')
  update(@Body() patch: Record<string, string>) {
    return this.siteSettingsService.update(patch);
  }
}
