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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';

@ApiTags('Products')
@ApiBearerAuth('access-token')
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
  // Staff-readable: returns unpublished/inactive products too, so it must
  // not be public. Sales needs it to look up stock and pricing when quoting.
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  getAdminStats() {
    return this.productsService.getAdminStats();
  }

  // Admin lookup by numeric id — declared before ':slug' so "by-id" isn't
  // swallowed as a slug value.
  // Staff-only: returns the full record regardless of publish state, and is
  // only ever called by the admin product view/editor. Left public it leaked
  // unpublished products and internal fields to anyone who guessed an id.
  @Get('by-id/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
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

  // Catalog writes are ADMIN-only — these were completely unguarded, so any
  // anonymous caller could create/edit/delete products and prices.
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }
}
