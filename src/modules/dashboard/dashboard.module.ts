import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Product,
  ProductVariant,
  Category,
  Company,
  QuoteRequest,
  Order,
  OrderItem,
  NewsletterSubscriber,
} from '../../entities';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      Category,
      Company,
      QuoteRequest,
      Order,
      OrderItem,
      NewsletterSubscriber,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
