import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OrderStatus, UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { ShippingEstimateDto } from './dto/shipping-estimate.dto';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findAllAdmin(
    @Query('status') status?: OrderStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.ordersService.findAllAdmin(status, Number(page), Number(limit));
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(':id/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  updateTracking(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrackingDto) {
    return this.ordersService.updateTracking(id, dto);
  }

  // Admin/sales: live tracking lookup for any order, no ownership check.
  @Get(':id/tracking/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  getTrackingAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.ordersService.getTrackingCheckpoints(id);
  }

  // Customer: live tracking lookup, restricted to the order's own owner.
  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard)
  async getTracking(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    // Reuses findOne's ownership check (throws NotFoundException if the order
    // doesn't belong to this user) before doing the live lookup.
    await this.ordersService.findOne(req.user.id, id);
    return this.ordersService.getTrackingCheckpoints(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req: any) {
    return this.ordersService.findAllForUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
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
