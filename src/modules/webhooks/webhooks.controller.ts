import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

// Public by design — Stripe/ShipStation/Shippo send their own signed
// payloads, not a bearer token, so these can't sit behind JwtAuthGuard.
// No signature verification is implemented yet (see webhooks.service.ts)
// since none of these providers are actually connected — do not treat this
// as production-ready until that's added.
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('stripe')
  stripe(@Body() event: any) {
    return this.webhooksService.handleStripeEvent(event);
  }

  @Post('shipstation')
  shipstation(@Body() payload: any) {
    return this.webhooksService.handleShipStationEvent(payload);
  }

  @Post('shippo')
  shippo(@Body() payload: any) {
    return this.webhooksService.handleShippoEvent(payload);
  }
}
