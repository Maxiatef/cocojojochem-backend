import { RequestStatus } from '../../entities';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { QuoteRequestsService } from './quote-requests.service';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';
import { DeclineQuoteDto, SaveQuoteDto, UpdateStatusDto } from './dto/quote.dto';



@ApiTags('Quote Requests')
@Controller('wholesale/quote-requests')
export class QuoteRequestsController {
  constructor(private readonly quoteRequestsService: QuoteRequestsService) {}

  // Public — the storefront's order request (the "Price to confirm" part of
  // the cart) and the sample form. Guests and signed-in customers both use
  // it; a valid customer token links the request to their account so it
  // shows in their request history and the admin can tell the two apart.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(@Req() req: any, @Body() dto: CreateQuoteRequestDto) {
    return this.quoteRequestsService.create(dto, req.user ?? null);
  }

  // The signed-in customer's own requests, newest first (account page).
  // Declared before ':id', which would otherwise swallow "mine".
  @Get('mine')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  findMine(@Req() req: any) {
    return this.quoteRequestsService.findMine(req.user.id);
  }

  @Get()
  @RequirePermission('canViewQuoteRequests')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  findAll(@Query('status') status?: RequestStatus, @Query('orderId') orderId?: string) {
    return this.quoteRequestsService.findAll(status, orderId);
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestsService.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('canEditQuoteRequest')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.quoteRequestsService.updateStatus(id, dto.status, dto.reason);
  }

  // Price the request; `send: true` emails the quote to the customer.
  @Put(':id/quote')
  @RequirePermission('canEditQuoteRequest')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  saveQuote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveQuoteDto) {
    return this.quoteRequestsService.saveQuote(id, dto);
  }
}

/**
 * The customer's side of a quote, reached through the private link in the
 * quote email (/quotes/<token>). Public: the unguessable token is the key,
 * so guests can use it without an account.
 */
@ApiTags('Quotes')
@Controller('wholesale/quotes')
export class QuotesController {
  constructor(private readonly quoteRequestsService: QuoteRequestsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  get(@Param('token') token: string) {
    return this.quoteRequestsService.getQuoteByToken(token);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':token/accept')
  accept(@Param('token') token: string) {
    return this.quoteRequestsService.acceptQuote(token);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':token/unaccept')
  unaccept(@Param('token') token: string) {
    return this.quoteRequestsService.unacceptQuote(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/decline')
  decline(@Param('token') token: string, @Body() dto: DeclineQuoteDto) {
    return this.quoteRequestsService.declineQuote(token, dto.reason);
  }
}
