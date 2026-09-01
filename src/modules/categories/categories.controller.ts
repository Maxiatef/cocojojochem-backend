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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
