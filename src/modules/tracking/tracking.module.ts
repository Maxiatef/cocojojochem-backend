import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PageView } from '../../entities';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PageView])],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
