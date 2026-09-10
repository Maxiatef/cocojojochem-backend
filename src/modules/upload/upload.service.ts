import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isUploadSubfolder } from './upload-subfolders';

// Ported from the real cocojojo.com upload.service.ts — same disk-storage
// approach, same 5MB limit, same allowed mime types.
// mimetype -> the extensions that legitimately carry it. Both must agree; see
// validateDocumentFile for why checking only the mimetype is unsafe.
export const ALLOWED_DOCUMENT_TYPES = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
} as const;

// Certificates are scans and routinely larger than a product photo, so this
// is well above the 5MB image limit.
export const MAX_DOCUMENT_SIZE = 15 * 1024 * 1024;

// Types a browser can safely render in a tab. Everything else is sent as a
// download instead (see the uploads static handler in main.ts).
export const INLINE_VIEWABLE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

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

  // Sanitises here rather than trusting callers: the returned URL is stored
  // on products/variants, so a traversal-shaped folder would persist a
  // permanently broken image path even though multer already wrote the file
  // to a safe directory.
  generateImageUrl(filename: string, subfolder: string = 'temp'): string {
    // Defence in depth: callers already pass a route constant, but this
    // guarantees a traversal-shaped value can never be persisted in a URL.
    const safeSubfolder = isUploadSubfolder(subfolder) ? subfolder : 'temp';
    const baseUrl = process.env.BASE_URL || 'http://localhost:4000';
    if (baseUrl.includes('static.')) {
      return `${baseUrl}/uploads/${safeSubfolder}/${filename}`;
    }
    return `${baseUrl}/api/uploads/${safeSubfolder}/${filename}`;
  }

  /**
   * Product documents (COA / SDS / TDS / spec sheets) and scanned
   * certificates.
   *
   * Checked on BOTH mimetype and extension. The browser supplies the
   * mimetype, so it is attacker-controlled on a direct API call — a file
   * claiming `application/pdf` while named `.html` would be served back as
   * HTML from our own origin, which is stored XSS. Requiring the pair to
   * agree closes that.
   *
   * SVG is deliberately absent even though it is an image: it can carry
   * <script>, and these files are served same-origin.
   */
  validateDocumentFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const extension = (file.originalname.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
    const allowed = ALLOWED_DOCUMENT_TYPES[file.mimetype as keyof typeof ALLOWED_DOCUMENT_TYPES];

    if (!allowed) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: PDF, Word, Excel, CSV, JPG, PNG, WebP.`,
      );
    }
    if (!(allowed as readonly string[]).includes(extension)) {
      throw new BadRequestException(
        `File extension "${extension || 'none'}" does not match its type (${file.mimetype}).`,
      );
    }
    if (file.size > MAX_DOCUMENT_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_DOCUMENT_SIZE / (1024 * 1024)}MB`,
      );
    }
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
