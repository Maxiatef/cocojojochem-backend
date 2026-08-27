import { Controller, Post, Body, Req, Headers } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

// Public by design — Stripe/ShipStation/Shippo send their own signed
// payloads, not a bearer token, so these can't sit behind JwtAuthGuard.
// Stripe requests are signature-verified in WebhooksService using the raw
// body (see main.ts's express.raw() mount for /api/webhooks/stripe).
// ShipStation/Shippo signature verification is still TODO (see
// webhooks.service.ts) since those providers aren't connected yet.
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('stripe')
  stripe(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    return this.webhooksService.handleStripeEvent(req.body as Buffer, signature);
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
