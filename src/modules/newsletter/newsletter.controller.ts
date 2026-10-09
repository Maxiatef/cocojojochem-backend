import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NewsletterService } from './newsletter.service';
import { NewsletterTokenDto, SubscribeNewsletterDto, UpdateNewsletterPreferencesDto } from './dto/newsletter.dto';

// Every route is a POST, including the read: the private token belongs in a
// request body, never in a URL that ends up in logs or browser history.
@ApiTags('Newsletter')
@Controller('wholesale/newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('subscribe')
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto.email, dto.interests, dto.consent, dto.website);
  }

  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @Post('preferences/read')
  @HttpCode(200)
  read(@Body() dto: NewsletterTokenDto) {
    return this.newsletterService.read(dto.token);
  }

  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @Post('preferences')
  @HttpCode(200)
  update(@Body() dto: UpdateNewsletterPreferencesDto) {
    return this.newsletterService.updatePreferences(dto.token, dto.interests, dto.consent);
  }

  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @Post('unsubscribe')
  @HttpCode(200)
  unsubscribe(@Body() dto: NewsletterTokenDto) {
    return this.newsletterService.unsubscribe(dto.token);
  }
}
