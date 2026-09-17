import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { BulkSalesService } from './bulk-sales.service';
import { CreateBulkSaleDto } from './dto/create-bulk-sale.dto';
import { UpdateBulkSaleDto } from './dto/update-bulk-sale.dto';

@ApiTags('Bulk Sales')
@ApiBearerAuth('access-token')
// Class default is staff-wide so sales can view the bulk-sale campaigns shown
// on the admin Coupons page; each write route below re-tightens to ADMIN.
@Controller('bulk-sales')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BulkSalesController {
  constructor(private readonly bulkSalesService: BulkSalesService) {}

  @Get()
  @RequirePermission('canViewBulkSales')
  findAll() {
    return this.bulkSalesService.findAll();
  }

  @Get(':id')
  @RequirePermission('canViewBulkSales')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.bulkSalesService.findOne(id);
  }

  @Post()
  @RequirePermission('canCreateBulkSale')
  create(@Body() dto: CreateBulkSaleDto) {
    return this.bulkSalesService.create(dto);
  }

  @Patch(':id')
  @RequirePermission('canEditBulkSale')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBulkSaleDto) {
    return this.bulkSalesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('canDeleteBulkSale')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.bulkSalesService.remove(id);
  }
}
