import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SeoPagesService } from './seo-pages.service';
import { CreateSeoPageDto } from './dto/create-seo-page.dto';
import { UpdateSeoPageDto } from './dto/update-seo-page.dto';

@ApiTags('SEO Pages')
@Controller('seo-pages')
export class SeoPagesController {
  constructor(private readonly seoPagesService: SeoPagesService) {}

  // Public — used by storefront pages to fetch SEO overrides for a given path
  @Get('by-path')
  findByPath(@Query('path') path: string) {
    return this.seoPagesService.findByPath(path);
  }

  @Get()
  @RequirePermission('canViewSeoPages')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAll() {
    return this.seoPagesService.findAll();
  }

  /**
   * Save the override for a path without the caller needing to know whether a
   * row exists. Used by the per-page editor in the admin SEO table.
   */
  @Put('by-path')
  @RequirePermission('canEditSeoPage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  upsertByPath(@Query('path') path: string, @Body() dto: UpdateSeoPageDto) {
    return this.seoPagesService.upsertByPath(path, dto);
  }

  @Get(':id')
  @RequirePermission('canViewSeoPages')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.findOne(id);
  }

  @Post()
  @RequirePermission('canCreateSeoPage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateSeoPageDto) {
    return this.seoPagesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditSeoPage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSeoPageDto) {
    return this.seoPagesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteSeoPage')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.remove(id);
  }
}
