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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductSort, QueryProductsDto } from './dto/query-products.dto';
import { UUID_RE } from '../../common/uuid';

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
      categoryId || undefined,
      Number(page),
      Number(limit),
    );
  }

  // Admin listing — includes inactive/unpublished products, unlike the public list above.
  // Staff-readable: returns unpublished/inactive products too, so it must
  // not be public. Sales needs it to look up stock and pricing when quoting.
  @Get('admin')
  @RequirePermission('canViewProducts')
  @UseGuards(JwtAuthGuard, PermissionGuard)
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
      categoryId || undefined,
      functionSlug,
      isPublished,
      sort,
      stockStatus,
      lowStock,
    );
  }

  // Backs the clickable status cards atop the admin Products page.
  @Get('admin/stats')
  @RequirePermission('canViewProducts')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getAdminStats() {
    return this.productsService.getAdminStats();
  }

  // Admin lookup by id — declared before ':slug' so "by-id" isn't
  // A guest's wishlist is a list of product ids in their browser, so it needs
  // to resolve several products in one call. Public visibility rules apply —
  // this returns only what the catalogue already shows anyone.
  @Get('by-ids')
  findByIds(@Query('ids') ids?: string) {
    return this.productsService.findPublicByIds(
      (ids || '')
        .split(',')
        .map((raw) => raw.trim())
        // Anything that is not a uuid is dropped rather than passed to the
        // query: postgres rejects a malformed uuid with a 500, and this is a
        // public endpoint taking a free-text query string.
        .filter((raw) => UUID_RE.test(raw)),
    );
  }

  // Checkout upsell: "you may also need" for the cart as a whole, rather than
  // for one product. Takes the cart's variant ids because that is what both
  // carts (guest localStorage and the server cart) hold. Declared above
  // ':slug' or it is swallowed as a slug value.
  //
  // Capped at 12 server-side: the limit is a query string, and an uncapped one
  // turns a public endpoint into "select the whole catalogue with its six
  // joined collections".
  @Get('cart-suggestions')
  findCartSuggestions(@Query('variantIds') variantIds?: string, @Query('limit') limit = '3') {
    const parsed = Number(limit);
    return this.productsService.findCartSuggestions(
      (variantIds || '')
        .split(',')
        .map((raw) => raw.trim())
        .filter((raw) => UUID_RE.test(raw)),
      Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 12) : 3,
    );
  }

  // swallowed as a slug value.
  // Staff-only: returns the full record regardless of publish state, and is
  // only ever called by the admin product view/editor. Left public it leaked
  // unpublished products and internal fields to anyone who guessed an id.
  @Get('by-id/:id')
  @RequirePermission('canViewProducts')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findById(id);
  }

  // Staff lookup by slug, so the admin editor's URL can read as a product name
  // rather than a uuid. Declared before ':slug' for the same reason as
  // 'by-id' — otherwise "by-slug" is swallowed as a slug value.
  @Get('by-slug/:slug')
  @RequirePermission('canViewProducts')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findBySlugForStaff(@Param('slug') slug: string) {
    return this.productsService.findBySlugForStaff(slug);
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
  @RequirePermission('canCreateProduct')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditProduct')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteProduct')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }
}
