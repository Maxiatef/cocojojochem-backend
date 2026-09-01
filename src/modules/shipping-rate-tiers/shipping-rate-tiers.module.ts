import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShippingRateTier } from '../../entities';
import { ShippingRateTiersService } from './shipping-rate-tiers.service';
import { ShippingRateTiersController } from './shipping-rate-tiers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ShippingRateTier])],
  controllers: [ShippingRateTiersController],
  providers: [ShippingRateTiersService],
  exports: [ShippingRateTiersService],
})
export class ShippingRateTiersModule {}
