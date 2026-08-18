import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Coupon, CouponUsage, Order, OrderItem, Product, Category, ProductVariant } from '../../entities';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Coupon, CouponUsage, Order, OrderItem, Product, Category, ProductVariant]),
  ],
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
