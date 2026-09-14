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
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { QueryCouponsDto } from './dto/query-coupons.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // Public — used by the storefront cart/checkout to validate a coupon code.
  // Rate-limited so it can't be used to brute-force guess valid codes.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('validate')
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponsService.validateCoupon(dto);
  }

  // Reads are ADMIN + SALES — sales needs to see which promotions exist and
  // how they're performing when quoting a customer. Creating, editing and
  // deleting coupons stays ADMIN-only further down: a coupon is a direct
  // discount on revenue.
  @Get()
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAll(@Query() query: QueryCouponsDto) {
    return this.couponsService.findAll(query);
  }

  @Get('analytics/all')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getAnalyticsAll() {
    return this.couponsService.getAnalyticsAll();
  }

  @Get('helpers/search-products')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  searchProducts(@Query('q') q?: string) {
    return this.couponsService.searchProducts(q || '');
  }

  @Get('helpers/search-categories')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  searchCategories(@Query('q') q?: string) {
    return this.couponsService.searchCategories(q || '');
  }

  @Get('helpers/search-variants')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  searchVariants(@Query('q') q?: string) {
    return this.couponsService.searchVariants(q || '');
  }

  @Get('analytics/:id')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getAnalyticsForCoupon(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.getAnalyticsForCoupon(id);
  }

  @Get(':id')
  @RequirePermission('canViewCoupons')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.findOne(id);
  }

  @Post()
  @RequirePermission('canCreateCoupon')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditCoupon')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteCoupon')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.remove(id);
  }
}
