import { OrderStatus } from '../../entities';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { GuestTrackDto } from './dto/guest-track.dto';
import { ShippingEstimateDto } from './dto/shipping-estimate.dto';
import { ZONE_BY_STATE, US_STATE_NAMES } from './shipping-zones.constants';

class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

@ApiTags('Orders')
@ApiBearerAuth('access-token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // Admin/sales: all orders across every customer, joined to user + company
  @Get('admin')
  @RequirePermission('canViewOrders')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAllAdmin(
    @Query('status') status?: OrderStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.findAllAdmin(status, Number(page), Number(limit));
  }

  // Declared before ':id' — 'admin' as a numeric id would 400 on ParseUUIDPipe.
  @Get('admin/stats')
  @RequirePermission('canViewOrders')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getAdminStats() {
    return this.ordersService.getAdminStats();
  }

  // Read-only reference data for the admin Shipping settings screen: which
  // states fall in each zone (fixed — not editable here). The actual $
  // rate tables those zones are priced from are admin-editable and served
  // by GET /admin/shipping-rate-tiers?kind=WEIGHT|DRUM instead.
  @Get('admin/shipping-reference')
  @RequirePermission('canViewOrders')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getShippingReference() {
    const zones = Array.from({ length: 8 }, (_, i) => i + 1).map((zone) => ({
      zone,
      states: Object.entries(ZONE_BY_STATE)
        .filter(([, z]) => z === zone)
        .map(([code]) => ({ code, name: US_STATE_NAMES[code] || code }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));

    return { zones };
  }

  // Cancelling is a different act from advancing an order through its normal
  // lifecycle — it's the one status change that loses a sale and can't be
  // undone from the admin — so it has its own permission. Both live on this
  // one route because the frontend cancels by setting the status, so the check
  // is made here rather than with a static @RequirePermission.
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateStatus(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const required =
      dto.status === OrderStatus.CANCELLED ? 'canCancelOrder' : 'canEditOrderStatus';
    if (req.user?.permissions?.[required] !== true) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(':id/tracking')
  @RequirePermission('canEditOrderTracking')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateTracking(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTrackingDto) {
    return this.ordersService.updateTracking(id, dto);
  }

  // Admin/sales: live tracking lookup for any order, no ownership check.
  @Get(':id/tracking/admin')
  @RequirePermission('canViewOrders')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getTrackingAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getTrackingCheckpoints(id);
  }

  // Public: guest order tracking by order number + the email that placed it.
  //
  // POST, not GET, so the email never lands in a URL (and therefore never in
  // access logs, browser history or a Referer header). Unauthenticated by
  // necessity — guests have no account — so it is rate-limited hard: 10
  // attempts per 10 minutes per IP makes brute-forcing the email for a known
  // order id impractical, while leaving room for a customer who mistypes.
  @Post('guest-track')
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  guestTrack(@Body() dto: GuestTrackDto) {
    return this.ordersService.trackAsGuest(dto.orderId, dto.email);
  }

  // Customer: live tracking lookup, restricted to the order's own owner.
  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard)
  async getTracking(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    // Reuses findOne's ownership check (throws NotFoundException if the order
    // doesn't belong to this user) before doing the live lookup.
    await this.ordersService.findOne(req.user.id, id);
    return this.ordersService.getTrackingCheckpoints(id);
  }

  // Customer: cancel your own order, while it is still cancellable.
  //
  // Ownership is checked inside cancelByCustomer (loads by id + userId), and
  // eligibility is re-checked there too — the disabled button in the UI is a
  // convenience, never the security boundary. Throttled because each call
  // can trigger a restock, a coupon rollback and two emails.
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  cancelOwnOrder(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.cancelByCustomer(req.user.id, id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: any) {
    return this.ordersService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(req.user.id, id);
  }

  // Unauthenticated by design (guest checkout) — the endpoint most exposed to
  // order-spam/card-testing bots, so it gets its own tight limit.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post('checkout')
  @UseGuards(OptionalJwtAuthGuard)
  checkout(@Req() req: any, @Body() dto: CheckoutDto) {
    return this.ordersService.checkout(req.user?.id ?? null, dto);
  }

  // Public, pre-account — used while filling out the checkout form, well
  // before login/guest identity is known.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('shipping-estimate')
  shippingEstimate(@Body() dto: ShippingEstimateDto) {
    return this.ordersService.getShippingEstimate(dto);
  }
}
