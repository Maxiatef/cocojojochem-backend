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

  getItems(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async getSummary(userId: string) {
    const items = await this.getItems(userId);
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    return { count, items };
  }

  // A catalog line is identified by its product, a supplier-reference line by
  // its reference code; either way, plus the requested size.
  private sameLine(item: QuoteListItem, dto: AddQuoteListItemDto) {
    const isReference = dto.source === 'SUPPLIER_REFERENCE';
    const target = isReference
      ? item.source === 'SUPPLIER_REFERENCE' && item.referenceCode === dto.referenceCode
      : item.source !== 'SUPPLIER_REFERENCE' && item.productId === dto.productId;
    return target && item.variantLabel === (dto.variantLabel ?? null);
  }

  private build(userId: string, dto: AddQuoteListItemDto) {
    const isReference = dto.source === 'SUPPLIER_REFERENCE';
    return this.repo.create({
      userId,
      source: isReference ? 'SUPPLIER_REFERENCE' : 'COCOJOJO',
      productId: isReference ? null : dto.productId ?? null,
      referenceCode: isReference ? dto.referenceCode ?? null : null,
      sourceUrl: isReference ? dto.sourceUrl ?? null : null,
      productSlug: dto.productSlug,
      productName: dto.productName,
      variantLabel: dto.variantLabel ?? null,
      imageUrl: dto.imageUrl ?? null,
      quantity: dto.quantity,
    });
  }

  // Adding something already on the list raises its quantity rather than
  // creating a second line for the same thing.
  async addItem(userId: string, dto: AddQuoteListItemDto) {
    const existing = (await this.getItems(userId)).find((i) => this.sameLine(i, dto));
    if (existing) {
      existing.quantity += dto.quantity;
      return this.repo.save(existing);
    }
    return this.repo.save(this.build(userId, dto));
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const item = await this.repo.findOne({ where: { id: itemId, userId } });
    if (!item) {
      throw new NotFoundException(
        'This quote list item no longer exists — it may have already been removed. Please refresh.',
      );
    }
    item.quantity = quantity;
    return this.repo.save(item);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.repo.findOne({ where: { id: itemId, userId } });
    if (!item) {
      throw new NotFoundException(
        'This quote list item no longer exists — it may have already been removed. Please refresh.',
      );
    }
    return this.repo.remove(item);
  }

  async clear(userId: string) {
    const items = await this.getItems(userId);
    if (items.length) await this.repo.remove(items);
    return { cleared: items.length };
  }

  // Merges a guest (localStorage) quote list into the server list on
  // login/register — same reasoning as CartService.mergeGuestCart:
  // matching items (same productId + variantLabel) get their quantities
  // combined instead of duplicated.
  async mergeGuestList(userId: string, guestItems: AddQuoteListItemDto[]) {
    for (const guestItem of guestItems) {
      await this.addItem(userId, guestItem);
    }
    return this.getItems(userId);
  }
}
