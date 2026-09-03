import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuoteListItem } from '../../entities';
import { AddQuoteListItemDto } from './dto/add-quote-list-item.dto';

@Injectable()
export class QuoteListService {
  constructor(
    @InjectRepository(QuoteListItem)
    private readonly repo: Repository<QuoteListItem>,
  ) {}

  getItems(userId: number) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async getSummary(userId: number) {
    const items = await this.getItems(userId);
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    return { count, items };
  }

  addItem(userId: number, dto: AddQuoteListItemDto) {
    const item = this.repo.create({
      userId,
      productId: dto.productId,
      productSlug: dto.productSlug,
      productName: dto.productName,
      variantLabel: dto.variantLabel ?? null,
      imageUrl: dto.imageUrl ?? null,
      quantity: dto.quantity,
    });
    return this.repo.save(item);
  }

  async updateItemQuantity(userId: number, itemId: number, quantity: number) {
    const item = await this.repo.findOne({ where: { id: itemId, userId } });
    if (!item) {
      throw new NotFoundException(
        'This quote list item no longer exists — it may have already been removed. Please refresh.',
      );
    }
    item.quantity = quantity;
    return this.repo.save(item);
  }

  async removeItem(userId: number, itemId: number) {
    const item = await this.repo.findOne({ where: { id: itemId, userId } });
    if (!item) {
      throw new NotFoundException(
        'This quote list item no longer exists — it may have already been removed. Please refresh.',
      );
    }
    return this.repo.remove(item);
  }

  async clear(userId: number) {
    const items = await this.getItems(userId);
    if (items.length) await this.repo.remove(items);
    return { cleared: items.length };
  }

  // Merges a guest (localStorage) quote list into the server list on
  // login/register — same reasoning as CartService.mergeGuestCart:
  // matching items (same productId + variantLabel) get their quantities
  // combined instead of duplicated.
  async mergeGuestList(userId: number, guestItems: AddQuoteListItemDto[]) {
    const existingItems = await this.getItems(userId);
    for (const guestItem of guestItems) {
      const existing = existingItems.find(
        (i) => i.productId === guestItem.productId && i.variantLabel === (guestItem.variantLabel ?? null),
      );
      if (existing) {
        existing.quantity += guestItem.quantity;
        await this.repo.save(existing);
      } else {
        const saved = await this.addItem(userId, guestItem);
        existingItems.push(saved);
      }
    }
    return this.getItems(userId);
  }
}
