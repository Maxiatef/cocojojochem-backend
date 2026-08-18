import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
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

  @Post()
  create(@Body() dto: CreateCertificationDto) {
    return this.certificationsService.create(dto.name, dto.iconUrl);
  }
}
