import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
  });

  // Ensure upload directories exist — ported from the real cocojojo.com main.ts
  const uploadDirs = ['./uploads', './uploads/products', './uploads/variants', './uploads/categories', './uploads/gallery', './uploads/temp'];
  uploadDirs.forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  // Serve uploaded images with CORS headers — same dual-path pattern as the
  // real site (both /api/uploads and /uploads resolve to the same folder).
  const uploadsCors = (_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Max-Age', '86400');
    next();
  };
  app.use('/api/uploads', uploadsCors, express.static(join(process.cwd(), 'uploads')));
  app.use('/uploads', uploadsCors, express.static(join(process.cwd(), 'uploads')));

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CocoJojoChem Wholesale API')
    .setDescription('Backend API for the CocoJojoChem wholesale catalog, accounts, orders, and admin dashboard')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`cocojojochem backend running on http://localhost:${port}/api`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}
bootstrap();
