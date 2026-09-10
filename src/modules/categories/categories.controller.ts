import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  ) {
    return this.categoriesService.findAll(Number(page), Number(limit), search, sort);
  }

  // Nested parent/children tree for menus/sidebars
  @Get('tree')
  findTree() {
    return this.categoriesService.findTree();
  }

  // Full detail view for the admin "View Category" page: category + parent/children + all products in it.
  @Get('id/:id')
  findByIdDetail(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findByIdWithProducts(id);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
