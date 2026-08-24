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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

@ApiTags('Products')
@Controller('wholesale/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: QueryProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get('featured')
  findFeatured(@Query('limit') limit = '12') {
    return this.productsService.findFeatured(Number(limit));
  }

  // A-Z browse index, grouped by first letter
  @Get('az-index')
  findAZIndex() {
    return this.productsService.findAZIndex();
  }

  // Ranked full-text + trigram search (ported from the real cocojojo.com wholesale search)
  @Get('search')
  search(
    @Query('query') query: string,
    @Query('categoryId') categoryId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.productsService.search(
      query,
      categoryId ? Number(categoryId) : undefined,
      Number(page),
      Number(limit),
    );
  }

  // Admin listing — includes inactive/unpublished products, unlike the public list above.
  @Get('admin')
  findAllAdmin(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('functionSlug') functionSlug?: string,
    @Query('isPublished') isPublished?: string,
    @Query('sort') sort?: ProductSort,
    @Query('stockStatus') stockStatus?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.productsService.findAllAdmin(
      Number(page),
      Number(limit),
      search,
      categoryId ? Number(categoryId) : undefined,
      functionSlug,
      isPublished,
      sort,
      stockStatus,
      lowStock,
    );
  }

  // Backs the clickable status cards atop the admin Products page.
  @Get('admin/stats')
  getAdminStats() {
    return this.productsService.getAdminStats();
  }

  // Admin lookup by numeric id — declared before ':slug' so "by-id" isn't
  // swallowed as a slug value.
  @Get('by-id/:id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findById(id);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string, @Query('password') password?: string) {
    return this.productsService.findBySlug(slug, password);
  }

  @Get(':slug/related')
  findRelated(@Param('slug') slug: string, @Query('limit') limit = '8') {
    return this.productsService.findRelated(slug, Number(limit));
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
