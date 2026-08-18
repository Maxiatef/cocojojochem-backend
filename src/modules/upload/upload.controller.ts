import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Logger,
  Body,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

// Ported from the real cocojojo.com upload.controller.ts — same endpoints,
// same response shape, same per-purpose routing (destination folder is
// resolved from the request URL in UploadModule's multer config).
@ApiTags('Uploads')
@Controller('uploads')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(private readonly uploadService: UploadService) {}

  @Post('product-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProductImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('subfolder') subfolder?: string,
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      this.logger.log(`File received: ${file.originalname}, size: ${file.size}, path: ${file.path}`);

      this.uploadService.validateImageFile(file);
      const imageUrl = this.uploadService.generateImageUrl(file.filename, subfolder || 'products');

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

  @Post('multiple-images')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('subfolder') subfolder?: string,
  ) {
    try {
      if (!files || files.length === 0) {
        throw new BadRequestException('No files uploaded');
      }

      const uploadedFiles = [];
      const folder = subfolder || 'gallery';

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
