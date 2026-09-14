import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';

@ApiTags('Wishlist')
@ApiBearerAuth('access-token')
@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getItems(@Req() req: any) {
    return this.wishlistService.getItems(req.user.id);
  }

  // Just the saved product ids. Every product tile on a listing page needs
  // to know whether its own product is saved; one cached array answers all of
  // them, where GET /wishlist would ship the full product payload to do it.
  @Get('ids')
  getIds(@Req() req: any) {
    return this.wishlistService.getIds(req.user.id);
  }

  @Get('summary')
  getSummary(@Req() req: any) {
    return this.wishlistService.getSummary(req.user.id);
  }

  @Post('merge')
  mergeGuestList(@Req() req: any, @Body('productIds') productIds: number[]) {
    return this.wishlistService.mergeGuestList(req.user.id, productIds);
  }

  @Post('items')
  addItem(@Req() req: any, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.addItem(req.user.id, dto.productId);
  }

  // Addressed by productId rather than row id: the client holds a set of
  // saved product ids (that is all a guest list is), so it never knows a row
  // id to send.
  @Delete('items/:productId')
  removeItem(@Req() req: any, @Param('productId', ParseIntPipe) productId: number) {
    return this.wishlistService.removeItem(req.user.id, productId);
  }

  @Delete()
  clear(@Req() req: any) {
    return this.wishlistService.clear(req.user.id);
  }
}
