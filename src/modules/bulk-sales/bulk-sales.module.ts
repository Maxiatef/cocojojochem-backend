import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkSaleDiscount, ProductVariant } from '../../entities';
import { BulkSalesService } from './bulk-sales.service';
import { BulkSalesController } from './bulk-sales.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BulkSaleDiscount, ProductVariant])],
  controllers: [BulkSalesController],
  providers: [BulkSalesService],
  exports: [BulkSalesService],
})
export class BulkSalesModule {}
