import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Cart, Order, OrderItem, ProductVariant } from '../../entities';
import { UsersModule } from '../users/users.module';
import { CouponsModule } from '../coupons/coupons.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Cart, ProductVariant]),
    UsersModule,
    CouponsModule,
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
