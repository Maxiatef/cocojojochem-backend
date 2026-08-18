import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

// Ported from the real cocojojo.com upload.module.ts — same destination
// routing by request URL, same filename generation pattern, same fileFilter/limits.
@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (req, _file, cb) => {
          let subfolder = 'temp';

          if (req.url.includes('/product-image')) {
            subfolder = req.body?.subfolder || 'products';
          } else if (req.url.includes('/variant-image')) {
            subfolder = 'variants';
          } else if (req.url.includes('/category-image')) {
            subfolder = 'categories';
          } else if (req.url.includes('/multiple-images')) {
            subfolder = req.body?.subfolder || 'gallery';
          }

          const uploadDir = join('./uploads', subfolder);
          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
          cb(null, filename);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimeTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
