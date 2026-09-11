import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, ProductImage, ProductVariant, ProductSpec, ProductSeo, ProductDocument } from '../../entities';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { SeoAnalyzerModule } from '../seo-analyzer/seo-analyzer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductVariant,
      ProductImage,
      ProductSpec,
      ProductSeo,
      ProductDocument,
    ]),
    // For the per-product SEO score refreshed on every save.
    SeoAnalyzerModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
