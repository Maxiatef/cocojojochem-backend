import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NewsletterService } from './newsletter.service';

class SubscribeDto {
  @IsEmail()
  email: string;
}

@ApiTags('Newsletter')
@Controller('wholesale/newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('subscribe')
  subscribe(@Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto.email);
  }
}
