import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TrackingService } from './tracking.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';

@ApiTags('Tracking')
@Controller('track')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  // Public, unauthenticated — fired once per storefront page load. Higher
  // limit than form-submission endpoints since normal browsing legitimately
  // triggers many of these per minute.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('pageview')
  @HttpCode(204)
  async track(@Body() dto: TrackPageViewDto): Promise<void> {
    await this.trackingService.record(dto);
  }
}
