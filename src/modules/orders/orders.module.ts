import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Cart, Order, OrderItem, PendingCheckout, ProductVariant } from '../../entities';
import { UsersModule } from '../users/users.module';
import { CouponsModule } from '../coupons/coupons.module';
import { StripeModule } from '../stripe/stripe.module';
import { SiteSettingsModule } from '../site-settings/site-settings.module';
import { ShipStationModule } from '../shipstation/shipstation.module';
import { EmailModule } from '../email/email.module';
import { ShippingRateTiersModule } from '../shipping-rate-tiers/shipping-rate-tiers.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Cart, ProductVariant, PendingCheckout]),
    UsersModule,
    CouponsModule,
    StripeModule,
    SiteSettingsModule,
    ShipStationModule,
    EmailModule,
    ShippingRateTiersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
    }),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
