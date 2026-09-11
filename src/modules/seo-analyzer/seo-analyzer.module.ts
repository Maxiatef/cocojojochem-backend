import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoMetric, SeoIssue, SeoPage, Product, ProductSeo } from '../../entities';
import { SeoAnalyzerService } from './seo-analyzer.service';
import { SeoAnalyzerController } from './seo-analyzer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SeoMetric, SeoIssue, SeoPage, Product, ProductSeo])],
  controllers: [SeoAnalyzerController],
  providers: [SeoAnalyzerService],
  exports: [SeoAnalyzerService],
})
export class SeoAnalyzerModule {}
