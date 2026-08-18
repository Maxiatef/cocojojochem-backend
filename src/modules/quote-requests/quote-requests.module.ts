import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteRequest, QuoteRequestItem } from '../../entities';
import { QuoteRequestsService } from './quote-requests.service';
import { QuoteRequestsController } from './quote-requests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QuoteRequest, QuoteRequestItem])],
  controllers: [QuoteRequestsController],
  providers: [QuoteRequestsService],
  exports: [QuoteRequestsService],
})
export class QuoteRequestsModule {}
