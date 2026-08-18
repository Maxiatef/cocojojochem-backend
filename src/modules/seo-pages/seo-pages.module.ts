import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoPage } from '../../entities';
import { SeoPagesService } from './seo-pages.service';
import { SeoPagesController } from './seo-pages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SeoPage])],
  controllers: [SeoPagesController],
  providers: [SeoPagesService],
  exports: [SeoPagesService],
})
export class SeoPagesModule {}
