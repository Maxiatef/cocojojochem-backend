import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteSetting } from '../../entities';
import { SiteSettingsService } from './site-settings.service';
import { PublicSiteSettingsController, SiteSettingsController } from './site-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SiteSetting])],
  controllers: [SiteSettingsController, PublicSiteSettingsController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}
