import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BulkSalesService } from './bulk-sales.service';
import { CreateBulkSaleDto } from './dto/create-bulk-sale.dto';
import { UpdateBulkSaleDto } from './dto/update-bulk-sale.dto';

@ApiTags('Bulk Sales')
@ApiBearerAuth('access-token')
@Controller('bulk-sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BulkSalesController {
  constructor(private readonly bulkSalesService: BulkSalesService) {}

  @Get()
  findAll() {
    return this.bulkSalesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bulkSalesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBulkSaleDto) {
    return this.bulkSalesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBulkSaleDto) {
    return this.bulkSalesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.bulkSalesService.remove(id);
  }
}
