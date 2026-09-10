import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE, UploadService } from './upload.service';
import { UPLOAD_SUBFOLDER_BY_ROUTE } from './upload-subfolders';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

// Ported from the real cocojojo.com upload.controller.ts — same endpoints,
// same response shape, same per-purpose routing (destination folder is
// resolved from the request URL in UploadModule's multer config).
@ApiTags('Uploads')
// Class-level so a newly added endpoint can never be unguarded by omission.
// All four upload routes were previously public, which combined with the
// then-unsanitized destination folder meant anonymous arbitrary file write.
// The folder is now derived from the route and never from the request body.
// ADMIN + SALES: uploads back the product/category editors, and sales may
// attach imagery when preparing a listing.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SALES)
@ApiBearerAuth('access-token')
@Controller('uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post('product-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProductImage(
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      this.logger.log(`File received: ${file.originalname}, size: ${file.size}, path: ${file.path}`);

      this.uploadService.validateImageFile(file);
      // Resolve with the SAME fallback multer used for this route, so the URL
      // always points at where the file actually landed — an invalid subfolder
      // otherwise wrote to products/ but returned a temp/ URL, i.e. a 404.
      // Same URL-derived folder multer used, so the stored URL always points
      // at where the file actually landed.
      const imageUrl = this.uploadService.generateImageUrl(
        file.filename,
        UPLOAD_SUBFOLDER_BY_ROUTE.productImage,
      );

      this.logger.log(`Image uploaded successfully: ${file.filename} to ${file.path}`);

      return {
        success: true,
        message: 'Image uploaded successfully',
        data: {
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url: imageUrl,
          path: file.path,
        },
      };
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Post('variant-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadVariantImage(@UploadedFile() file: Express.Multer.File) {
    try {
      this.uploadService.validateImageFile(file);
      const imageUrl = this.uploadService.generateImageUrl(file.filename, 'variants');

      this.logger.log(`Variant image uploaded successfully: ${file.filename}`);

      return {
        success: true,
        message: 'Variant image uploaded successfully',
        data: {
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url: imageUrl,
          path: file.path,
        },
      };
    } catch (error) {
      this.logger.error(`Variant upload failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Post('category-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCategoryImage(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      this.logger.log(`Category file received: ${file.originalname}, size: ${file.size}, path: ${file.path}`);

      this.uploadService.validateImageFile(file);
      const imageUrl = this.uploadService.generateImageUrl(file.filename, 'categories');

      this.logger.log(`Category image uploaded successfully: ${file.filename} to ${file.path}`);

      return {
        success: true,
        message: 'Category image uploaded successfully',
        data: {
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url: imageUrl,
          path: file.path,
        },
      };
    } catch (error) {
      this.logger.error(`Category upload failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Product documents: COA / SDS / TDS / spec sheets, and scanned
   * certificates.
   *
   * Carries its own multer options rather than using the module-level ones,
   * which are image-only at 5MB — a PDF would be rejected by that fileFilter
   * before this handler ever ran. Registering the storage here keeps the
   * image rules untouched for every other route.
   */
  @Post('product-document')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join('./uploads', UPLOAD_SUBFOLDER_BY_ROUTE.productDocument);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          // Same pattern as the image routes: a generated name, never the
          // client's. The original is echoed back in the response for the UI
          // to show, but nothing derived from it touches the filesystem.
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        // First gate, so an oversized/disallowed upload is dropped while
        // streaming instead of after it has been written to disk.
        // validateDocumentFile re-checks (and also matches the extension).
        if (file.mimetype in ALLOWED_DOCUMENT_TYPES) {
          cb(null, true);
        } else {
          // A BadRequestException, not a bare Error: multer's error is
          // rethrown by the interceptor as-is, so a plain Error becomes an
          // opaque 500 and the admin never learns which types are allowed.
          cb(
            new BadRequestException(
              `Unsupported file type "${file.mimetype}". Allowed: PDF, Word, Excel, CSV, JPG, PNG, WebP.`,
            ),
            false,
          );
        }
      },
      limits: { fileSize: MAX_DOCUMENT_SIZE },
    }),
  )
  async uploadProductDocument(@UploadedFile() file: Express.Multer.File) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      this.uploadService.validateDocumentFile(file);
      const url = this.uploadService.generateImageUrl(
        file.filename,
        UPLOAD_SUBFOLDER_BY_ROUTE.productDocument,
      );

      this.logger.log(`Product document uploaded: ${file.filename} (${file.mimetype}, ${file.size} bytes)`);

      return {
        success: true,
        message: 'Document uploaded successfully',
        data: {
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url,
          path: file.path,
        },
      };
    } catch (error) {
      this.logger.error(`Document upload failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Post('multiple-images')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleImages(
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('No files uploaded');
      }

      const uploadedFiles = [];
      const folder = UPLOAD_SUBFOLDER_BY_ROUTE.multipleImages;

      for (const file of files) {
        this.uploadService.validateImageFile(file);
        const imageUrl = this.uploadService.generateImageUrl(file.filename, folder);

        uploadedFiles.push({
          filename: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url: imageUrl,
          path: file.path,
        });
      }

      this.logger.log(`Multiple images uploaded successfully: ${files.length} files`);

      return {
        success: true,
        message: `${files.length} images uploaded successfully`,
        data: uploadedFiles,
      };
    } catch (error) {
      this.logger.error(`Multiple upload failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
}
