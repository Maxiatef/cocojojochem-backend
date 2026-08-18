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

  @Patch()
  update(@Body() patch: Record<string, string>) {
    return this.siteSettingsService.update(patch);
  }
}
