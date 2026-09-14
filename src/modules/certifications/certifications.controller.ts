import { Body, Controller, Get, Param, ParseIntPipe, Post, Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CertificationsService } from './certifications.service';

class CreateCertificationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  iconUrl?: string;
}

@ApiTags('Certifications')
@Controller('wholesale/certifications')
export class CertificationsController {
  constructor(private readonly certificationsService: CertificationsService) {}

  @Get()
  findAll() {
    return this.certificationsService.findAll();
  }

  @Get(':id/products')
  findProducts(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.certificationsService.findProducts(id, Number(page), Number(limit));
  }

  // Writes are ADMIN-only. These endpoints previously had no guard at
  // all, so any anonymous caller could mutate the catalog.
  @Post()
  @RequirePermission('canCreateCertification')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateCertificationDto) {
    return this.certificationsService.create(dto.name, dto.iconUrl);
  }
}
