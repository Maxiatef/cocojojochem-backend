import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuoteListItem } from '../../entities';
import { QuoteListService } from './quote-list.service';
import { QuoteListController } from './quote-list.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QuoteListItem])],
  controllers: [QuoteListController],
  providers: [QuoteListService],
  exports: [QuoteListService],
})
export class QuoteListModule {}
