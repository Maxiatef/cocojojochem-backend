import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product, ProductDocument, DocType } from './src/entities';
import { Repository } from 'typeorm';
const [, , url, mode] = process.argv;
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const productsRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
  const docsRepo = app.get<Repository<ProductDocument>>(getRepositoryToken(ProductDocument));
  const product = await productsRepo.findOne({ where: { isPublished: true }, order: { id: 'ASC' } });
  if (!product) { console.log('no published product'); process.exit(1); }

  await docsRepo.delete({ productId: product.id });
  if (mode !== 'clean') {
    await docsRepo.save([
      docsRepo.create({ productId: product.id, url, type: DocType.COA, label: 'COA Lot 2291' }),
      docsRepo.create({ productId: product.id, url, type: DocType.SDS, label: 'Safety Data Sheet' }),
    ]);
  }
  const n = await docsRepo.count({ where: { productId: product.id } });
  console.log(`product #${product.id} slug=${product.slug} docs=${n}`);
  console.log(`URL: http://localhost:3000/products/${product.slug}`);
  await app.close();
  process.exit(0);
})();
