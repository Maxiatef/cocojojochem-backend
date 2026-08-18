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
import { RequestStatus, UserRole } from '../../entities';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findAll(@Query('status') status?: RequestStatus) {
    return this.quoteRequestsService.findAll(status);
  }

  @Get('stats')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  getStats() {
    return this.quoteRequestsService.getStats();
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quoteRequestsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SALES)
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusDto) {
    return this.quoteRequestsService.updateStatus(id, dto.status);
  }
}
