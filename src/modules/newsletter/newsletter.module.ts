import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsletterSubscriber } from '../../entities';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NewsletterSubscriber])],
  controllers: [NewsletterController],
  providers: [NewsletterService],
})
export class NewsletterModule {}
