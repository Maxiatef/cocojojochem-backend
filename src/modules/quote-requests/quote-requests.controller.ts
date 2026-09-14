import { RequestStatus } from '../../entities';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { QuoteRequestsService } from './quote-requests.service';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';

class UpdateStatusDto {
  @IsEnum(RequestStatus)
  status: RequestStatus;
}

@ApiTags('Quote Requests')
@Controller('wholesale/quote-requests')
export class QuoteRequestsController {
  constructor(private readonly quoteRequestsService: QuoteRequestsService) {}

  // Public — this is the "Request a Quote" / "Request a Sample" form on the site
  @Post()
  create(@Body() dto: CreateQuoteRequestDto) {
    return this.quoteRequestsService.create(dto);
  }

  @Get()
  @RequirePermission('canViewQuoteRequests')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAll(@Query('status') status?: RequestStatus) {
    return this.quoteRequestsService.findAll(status);
  }

  @Get('stats')
  @RequirePermission('canViewQuoteRequests')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  getStats() {
    return this.quoteRequestsService.getStats();
  }

  @Get(':id')
  @RequirePermission('canViewQuoteRequests')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quoteRequestsService.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('canEditQuoteRequest')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.quoteRequestsService.updateStatus(id, dto.status);
  }
}
