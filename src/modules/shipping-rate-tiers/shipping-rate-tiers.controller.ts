import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { ShippingRateTierKind } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ShippingRateTiersController {
  constructor(private readonly service: ShippingRateTiersService) {}

  @Get()
  findGrouped(@Query('kind') kind: string) {
    return this.service.findGrouped(parseKind(kind));
  }

  @Put(':kind/:zone/:breakpoint')
  upsert(
    @Param('kind') kind: string,
    @Param('zone', ParseIntPipe) zone: number,
    @Param('breakpoint') breakpoint: string,
    @Body() dto: UpsertRateTierDto,
  ) {
    return this.service.upsert(parseKind(kind), zone, Number(breakpoint), dto.amount);
  }
}
