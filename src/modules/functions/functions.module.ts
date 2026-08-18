import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Function as ProductFunction, Product } from '../../entities';
import { FunctionsService } from './functions.service';
import { FunctionsController } from './functions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProductFunction, Product])],
  controllers: [FunctionsController],
  providers: [FunctionsService],
  exports: [FunctionsService],
})
export class FunctionsModule {}
