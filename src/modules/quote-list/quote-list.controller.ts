import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuoteListService } from './quote-list.service';
import { AddQuoteListItemDto } from './dto/add-quote-list-item.dto';
import { UpdateQuoteListItemDto } from './dto/update-quote-list-item.dto';

@ApiTags('Quote List')
@ApiBearerAuth('access-token')
@Controller('quote-list')
@UseGuards(JwtAuthGuard)
export class QuoteListController {
  constructor(private readonly quoteListService: QuoteListService) {}

  @Get()
  getItems(@Req() req: any) {
    return this.quoteListService.getItems(req.user.id);
  }

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.quoteListService.getSummary(req.user.id);
  }

  @Post('merge')
  mergeGuestList(@Req() req: any, @Body('items') items: AddQuoteListItemDto[]) {
    return this.quoteListService.mergeGuestList(req.user.id, items);
  }

  @Post('items')
  addItem(@Req() req: any, @Body() dto: AddQuoteListItemDto) {
    return this.quoteListService.addItem(req.user.id, dto);
  }

  @Patch('items/:id')
  updateItem(@Req() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuoteListItemDto) {
    return this.quoteListService.updateItemQuantity(req.user.id, id, dto.quantity);
  }

  @Delete('items/:id')
  removeItem(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.quoteListService.removeItem(req.user.id, id);
  }

  @Delete()
  clear(@Req() req: any) {
    return this.quoteListService.clear(req.user.id);
  }
}
