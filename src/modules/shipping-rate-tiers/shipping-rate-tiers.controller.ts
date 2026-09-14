import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ShippingRateTierKind } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ShippingRateTiersService } from './shipping-rate-tiers.service';
import { UpsertRateTierDto } from './dto/upsert-rate-tier.dto';

function parseKind(raw: string): ShippingRateTierKind {
  const upper = (raw || '').toUpperCase();
  if (upper !== ShippingRateTierKind.WEIGHT && upper !== ShippingRateTierKind.DRUM) {
    throw new BadRequestException(`kind must be WEIGHT or DRUM, got "${raw}"`);
  }
  return upper as ShippingRateTierKind;
}

@ApiTags('Admin Shipping Rate Tiers')
@ApiBearerAuth('access-token')
@Controller('admin/shipping-rate-tiers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShippingRateTiersController {
  constructor(private readonly service: ShippingRateTiersService) {}

  @Get()
  @RequirePermission('canViewShippingRates')
  findGrouped(@Query('kind') kind: string) {
    return this.service.findGrouped(parseKind(kind));
  }

  @Put(':kind/:zone/:breakpoint')
  @RequirePermission('canEditShippingRates')
  upsert(
    @Param('kind') kind: string,
    @Param('zone', ParseIntPipe) zone: number,
    @Param('breakpoint') breakpoint: string,
    @Body() dto: UpsertRateTierDto,
  ) {
    return this.service.upsert(parseKind(kind), zone, Number(breakpoint), dto.amount);
  }
}
