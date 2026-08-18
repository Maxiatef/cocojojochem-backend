import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountStatus } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities';
import { CompaniesService } from './companies.service';

class UpdateStatusDto {
  @IsEnum(AccountStatus)
  status: AccountStatus;
}

@ApiTags('Companies')
@ApiBearerAuth('access-token')
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findAll() {
    return this.companiesService.findAll();
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  getStats() {
    return this.companiesService.getStats();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findById(id);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.companiesService.setStatus(id, dto.status);
  }

  @Get(':id/orders')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findOrders(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOrders(id);
  }

  @Get(':id/quote-requests')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findQuoteRequests(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findQuoteRequests(id);
  }
}
