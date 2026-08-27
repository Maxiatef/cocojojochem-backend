import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('Site Settings')
@ApiBearerAuth('access-token')
@Controller('site-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get()
  findAll() {
    return this.siteSettingsService.findAll();
  }

  // Read-only status of which third-party integrations have credentials
  // configured — never returns the actual key values. Keys themselves stay
  // in .env, not the DB, so there's nothing here for this endpoint to leak.
  @Get('integrations-status')
  getIntegrationsStatus() {
    return {
      stripe: !!process.env.STRIPE_SECRET_KEY,
      shipstation: !!process.env.SHIPSTATION_API_KEY,
      brevo: !!process.env.BREVO_API_KEY,
      shippo: !!process.env.SHIPPO_API_KEY,
    };
  }

  @Patch()
  update(@Body() patch: Record<string, string>) {
    return this.siteSettingsService.update(patch);
  }
}
