import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('Companies')
@ApiBearerAuth('access-token')
@Controller('companies')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermission('canViewCompanies')
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @RequirePermission('canViewCompanies')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('canEditCompany')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Get(':id/orders')
  @RequirePermission('canViewCompanies')
  findOrders(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOrders(id);
  }

  @Get(':id/quote-requests')
  @RequirePermission('canViewCompanies')
  findQuoteRequests(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findQuoteRequests(id);
  }
}
