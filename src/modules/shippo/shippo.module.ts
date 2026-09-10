import { Module } from '@nestjs/common';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { ShippoService } from './shippo.service';

// Shippo is the sole shipping provider: it creates the shipment, buys the
// label, returns the tracking number and pushes tracking updates.
// ShipStation is retained but commented out at its call sites — see
// OrdersService.pushOrderToShipStation and WebhooksService.
@Module({
  imports: [SiteSettingsModule],
  providers: [ShippoService],
  exports: [ShippoService],
})
export class ShippoModule {}
