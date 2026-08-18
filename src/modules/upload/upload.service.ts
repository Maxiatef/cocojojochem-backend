import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Ported from the real cocojojo.com upload.service.ts — same disk-storage
// approach, same 5MB limit, same allowed mime types.
@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadPath = './uploads';
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  constructor() {
    this.ensureUploadDirectoryExists();
  }

  private ensureUploadDirectoryExists() {
    const directories = [
      this.uploadPath,
      join(this.uploadPath, 'products'),
      join(this.uploadPath, 'variants'),
      join(this.uploadPath, 'categories'),
      join(this.uploadPath, 'gallery'),
      join(this.uploadPath, 'temp'),
    ];

    directories.forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.logger.log(`Created directory: ${dir}`);
      }
    });
  }

  generateImageUrl(filename: string, subfolder: string = 'temp'): string {
    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    if (baseUrl.includes('static.')) {
      return `${baseUrl}/uploads/${subfolder}/${filename}`;
    }
    return `${baseUrl}/api/uploads/${subfolder}/${filename}`;
  }

  validateImageFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File too large. Maximum size: ${this.maxFileSize / (1024 * 1024)}MB`,
      );
    }
  }

  getUploadPath(): string {
    return this.uploadPath;
  }
}
