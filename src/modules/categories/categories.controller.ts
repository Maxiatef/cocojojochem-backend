import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@ApiTags('Categories')
@Controller('wholesale/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('rootsOnly') rootsOnly?: string,
  ) {
    return this.categoriesService.findAll(
      Number(page),
      Number(limit),
      search,
      sort,
      rootsOnly === 'true',
    );
  }

  // Nested parent/children tree for menus/sidebars
  @Get('tree')
  findTree() {
    return this.categoriesService.findTree();
  }

  // Full detail view for the admin "View Category" page: category + parent/children + all products in it.
  @Get('id/:id')
  findByIdDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findByIdWithProducts(id);
  }

  // Same detail view as 'id/:id', reached by slug. Declared before ':slug' so
  // "slug" is not itself read as a category slug.
  @Get('slug/:slug/detail')
  findBySlugDetail(@Param('slug') slug: string) {
    return this.categoriesService.findBySlugWithProducts(slug);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  // Products in this category (and its subcategories), joined with variants/functions
  @Get(':slug/products')
  findProducts(
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.categoriesService.findProducts(slug, Number(page), Number(limit));
  }

  // Writes are ADMIN-only. These endpoints previously had no guard at
  // all, so any anonymous caller could mutate the catalog.
  @Post()
  @RequirePermission('canCreateCategory')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditCategory')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteCategory')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.remove(id);
  }
}
