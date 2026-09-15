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

/**
 * The settings the public storefront needs, unauthenticated.
 *
 * A separate controller rather than a route on the one above, because that
 * one carries class-level JwtAuthGuard and there is no way to opt a single
 * route out of a class guard. Its own path, so nothing here can ever
 * accidentally inherit the guarded controller's other routes.
 *
 * Only ever expose values that are safe for anyone to read.
 */
@ApiTags('Site Settings')
@Controller('site-settings/public')
export class PublicSiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  async getPublicSettings() {
    return { timezone: await this.siteSettingsService.getTimezone() };
  }
}
