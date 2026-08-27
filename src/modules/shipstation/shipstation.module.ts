import { Module } from '@nestjs/common';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { ShipStationService } from './shipstation.service';

@Module({
  imports: [SiteSettingsModule],
  providers: [ShipStationService],
  exports: [ShipStationService],
})
export class ShipStationModule {}
