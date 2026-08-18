import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem, ProductVariant, PurchaseType } from '../../entities';
import { AddCartItemDto } from './dto/add-cart-item.dto';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private readonly cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepo: Repository<CartItem>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  private async getOrCreateCart(userId: number) {
    let cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.variant', 'items.variant.product'],
    });
    if (!cart) {
      cart = await this.cartRepo.save(this.cartRepo.create({ userId, items: [] }));
    }
    return cart;
  }

  getCart(userId: number) {
    return this.getOrCreateCart(userId);
  }

  async addItem(userId: number, dto: AddCartItemDto) {
    const cart = await this.getOrCreateCart(userId);
    const variant = await this.variantRepo.findOne({ where: { id: dto.productVariantId } });
    if (!variant) throw new NotFoundException(`Variant #${dto.productVariantId} not found`);

    const item = this.cartItemRepo.create({
      cartId: cart.id,
      productVariantId: variant.id,
      quantity: dto.quantity,
      price: variant.price,
      purchaseType: dto.purchaseType || PurchaseType.ONE_TIME,
      subscriptionFrequencyMonths: dto.subscriptionFrequencyMonths ?? null,
    });
    return this.cartItemRepo.save(item);
  }

  async updateItemQuantity(userId: number, itemId: number, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Cart item #${itemId} not found`);
    item.quantity = quantity;
    return this.cartItemRepo.save(item);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException(`Cart item #${itemId} not found`);
    return this.cartItemRepo.remove(item);
  }

  // Totals joined from cart items + their live variant price/stock — what the
  // cart drawer/checkout summary needs without recomputing on the frontend.
  async getSummary(userId: number) {
    const cart = await this.getOrCreateCart(userId);
    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const outOfStockItems = cart.items.filter(
      (item) => item.variant?.stockStatus === 'OUT_OF_STOCK',
    );
    return { itemCount, subtotal, outOfStockItems, cart };
  }

  // Merges a guest (localStorage) cart into the server cart on login/register.
  async mergeGuestCart(userId: number, guestItems: AddCartItemDto[]) {
    const cart = await this.getOrCreateCart(userId);
    for (const guestItem of guestItems) {
      const existing = cart.items.find(
        (i) => i.productVariantId === guestItem.productVariantId,
      );
      if (existing) {
        existing.quantity += guestItem.quantity;
        await this.cartItemRepo.save(existing);
      } else {
        await this.addItem(userId, guestItem);
      }
    }
    return this.getOrCreateCart(userId);
  }
}
