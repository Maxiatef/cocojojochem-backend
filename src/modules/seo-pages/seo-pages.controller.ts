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
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.seoPagesService.findAll();
  }

  /**
   * Save the override for a path without the caller needing to know whether a
   * row exists. Used by the per-page editor in the admin SEO table.
   */
  @Put('by-path')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertByPath(@Query('path') path: string, @Body() dto: UpdateSeoPageDto) {
    return this.seoPagesService.upsertByPath(path, dto);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.findOne(id);
  }

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateSeoPageDto) {
    return this.seoPagesService.create(dto);
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSeoPageDto) {
    return this.seoPagesService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.seoPagesService.remove(id);
  }
}
