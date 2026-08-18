import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
